import { createContext, useContext, useReducer, useCallback, useRef, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useWebSocket } from '@/hooks/useWebSocket'
import { useAudioRecorder } from '@/hooks/useAudioRecorder'
import { useAudioPlayer } from '@/hooks/useAudioPlayer'

// Interview states
export const InterviewState = {
  IDLE: 'idle',
  CONNECTING: 'connecting',
  ACTIVE: 'active',
  ENDING: 'ending',
  COMPLETED: 'completed',
  ERROR: 'error',
}

// Initial state
const initialState = {
  state: InterviewState.IDLE,
  sessionId: null,
  config: null,
  transcripts: [],
  currentUserText: '',
  currentAssistantText: '',
  isSpeaking: false,
  isRecording: false,
  userAudioLevel: 0,
  assistantAudioLevel: 0,
  error: null,
  endReason: null,
  endSummary: null,
  evaluation: null,
  goAwayWarning: null,
  resumptionToken: null,
}

// Action types
const ActionType = {
  SET_STATE: 'SET_STATE',
  SET_SESSION: 'SET_SESSION',
  SET_CONFIG: 'SET_CONFIG',
  ADD_TRANSCRIPT: 'ADD_TRANSCRIPT',
  UPDATE_CURRENT_TEXT: 'UPDATE_CURRENT_TEXT',
  CLEAR_CURRENT_TEXT: 'CLEAR_CURRENT_TEXT',
  SET_SPEAKING: 'SET_SPEAKING',
  SET_RECORDING: 'SET_RECORDING',
  SET_USER_AUDIO_LEVEL: 'SET_USER_AUDIO_LEVEL',
  SET_ASSISTANT_AUDIO_LEVEL: 'SET_ASSISTANT_AUDIO_LEVEL',
  SET_ERROR: 'SET_ERROR',
  SET_END_DATA: 'SET_END_DATA',
  SET_EVALUATION: 'SET_EVALUATION',
  SET_GO_AWAY: 'SET_GO_AWAY',
  SET_RESUMPTION_TOKEN: 'SET_RESUMPTION_TOKEN',
  CLEAR_TRANSCRIPTS: 'CLEAR_TRANSCRIPTS',
  RESET: 'RESET',
}

// Reducer
function interviewReducer(state, action) {
  switch (action.type) {
    case ActionType.SET_STATE:
      return { ...state, state: action.payload }
    
    case ActionType.SET_SESSION:
      return { ...state, sessionId: action.payload }
    
    case ActionType.SET_CONFIG:
      return { ...state, config: action.payload }
    
    case ActionType.ADD_TRANSCRIPT:
      const { role, text, id } = action.payload
      if (!text || !text.trim()) return state
      console.log('[Context] Adding to history:', role, text.substring(0, 50))
      return {
        ...state,
        transcripts: [...state.transcripts, { id, role, text: text.trim(), timestamp: Date.now() }],
      }
    
    case ActionType.UPDATE_CURRENT_TEXT:
      console.log('[Context] Update current:', action.payload.role, action.payload.text?.substring(0, 50))
      if (action.payload.role === 'user') {
        return { ...state, currentUserText: action.payload.text }
      }
      return { ...state, currentAssistantText: action.payload.text }
    
    case ActionType.CLEAR_CURRENT_TEXT:
      console.log('[Context] Clear current:', action.payload)
      if (action.payload === 'user') {
        return { ...state, currentUserText: '' }
      }
      if (action.payload === 'assistant') {
        return { ...state, currentAssistantText: '' }
      }
      return { ...state, currentUserText: '', currentAssistantText: '' }
    
    case ActionType.SET_SPEAKING:
      return { ...state, isSpeaking: action.payload }
    
    case ActionType.SET_RECORDING:
      return { ...state, isRecording: action.payload }
    
    case ActionType.SET_USER_AUDIO_LEVEL:
      return { ...state, userAudioLevel: action.payload }
    
    case ActionType.SET_ASSISTANT_AUDIO_LEVEL:
      return { ...state, assistantAudioLevel: action.payload }
    
    case ActionType.SET_ERROR:
      return { ...state, state: InterviewState.ERROR, error: action.payload }
    
    case ActionType.SET_END_DATA:
      return {
        ...state,
        state: InterviewState.COMPLETED,
        endReason: action.payload.reason,
        endSummary: action.payload.summary,
      }
    
    case ActionType.SET_EVALUATION:
      return { ...state, evaluation: action.payload }
    
    case ActionType.SET_GO_AWAY:
      return { ...state, goAwayWarning: action.payload }
    
    case ActionType.SET_RESUMPTION_TOKEN:
      return { ...state, resumptionToken: action.payload }
    
    case ActionType.CLEAR_TRANSCRIPTS:
      return { ...state, transcripts: [], currentUserText: '', currentAssistantText: '' }
    
    case ActionType.RESET:
      return { ...initialState }
    
    default:
      return state
  }
}

// Context
const InterviewContext = createContext(null)

// Provider
export function InterviewProvider({ children }) {
  const { interviewId } = useParams()
  const navigate = useNavigate()
  const [state, dispatch] = useReducer(interviewReducer, initialState)
  const isConnectedRef = useRef(false)
  const stateRef = useRef(state.state)
  
  // Text accumulation refs
  const accumulatedUserTextRef = useRef('')
  const accumulatedAssistantTextRef = useRef('')
  
  // Timer refs for delayed move to history
  const userFinalTimerRef = useRef(null)
  const assistantFinalTimerRef = useRef(null)

  useEffect(() => {
    stateRef.current = state.state
  }, [state.state])

  // Audio level handlers
  const handleAssistantAudioLevel = useCallback((level) => {
    dispatch({ type: ActionType.SET_ASSISTANT_AUDIO_LEVEL, payload: level })
  }, [])

  const handleUserAudioLevel = useCallback((level) => {
    dispatch({ type: ActionType.SET_USER_AUDIO_LEVEL, payload: level })
  }, [])

  const handlePlaybackEnded = useCallback(() => {
    dispatch({ type: ActionType.SET_SPEAKING, payload: false })
  }, [])

  // Audio player
  const { playAudio, stopPlayback } = useAudioPlayer({
    onEnded: handlePlaybackEnded,
    onAudioLevel: handleAssistantAudioLevel,
  })

  const audioRecorderRef = useRef(null)

  // Handle transcript messages
  const handleTranscript = useCallback((text, isFinal, role) => {
    console.log('[handleTranscript]', role, isFinal ? 'FINAL' : 'interim', `"${text?.substring(0, 60)}"`)
    
    if (role === 'user') {
      // Clear pending timer if new text arrives
      if (userFinalTimerRef.current) {
        clearTimeout(userFinalTimerRef.current)
        userFinalTimerRef.current = null
      }
      
      if (isFinal) {
        // Show final text in live area
        accumulatedUserTextRef.current = text
        dispatch({
          type: ActionType.UPDATE_CURRENT_TEXT,
          payload: { role: 'user', text },
        })
        
        // After 2 seconds, move to history
        userFinalTimerRef.current = setTimeout(() => {
          const finalText = accumulatedUserTextRef.current
          if (finalText && finalText.trim()) {
            dispatch({
              type: ActionType.ADD_TRANSCRIPT,
              payload: { id: `user-${Date.now()}`, role: 'user', text: finalText },
            })
          }
          dispatch({ type: ActionType.CLEAR_CURRENT_TEXT, payload: 'user' })
          accumulatedUserTextRef.current = ''
        }, 2000)
      } else {
        // Update live text with interim
        accumulatedUserTextRef.current = text
        dispatch({
          type: ActionType.UPDATE_CURRENT_TEXT,
          payload: { role: 'user', text },
        })
      }
    } else {
      // Assistant transcript
      if (assistantFinalTimerRef.current) {
        clearTimeout(assistantFinalTimerRef.current)
        assistantFinalTimerRef.current = null
      }
      
      if (isFinal) {
        // For assistant, use accumulated text (Gemini sends incremental chunks)
        const finalText = accumulatedAssistantTextRef.current || text
        dispatch({
          type: ActionType.UPDATE_CURRENT_TEXT,
          payload: { role: 'assistant', text: finalText },
        })
        
        // After 2 seconds, move to history
        assistantFinalTimerRef.current = setTimeout(() => {
          if (finalText && finalText.trim()) {
            dispatch({
              type: ActionType.ADD_TRANSCRIPT,
              payload: { id: `assistant-${Date.now()}`, role: 'assistant', text: finalText },
            })
          }
          dispatch({ type: ActionType.CLEAR_CURRENT_TEXT, payload: 'assistant' })
          accumulatedAssistantTextRef.current = ''
        }, 2000)
      } else {
        // Accumulate interim text (Gemini sends word by word)
        accumulatedAssistantTextRef.current += text
        dispatch({
          type: ActionType.UPDATE_CURRENT_TEXT,
          payload: { role: 'assistant', text: accumulatedAssistantTextRef.current },
        })
      }
    }
  }, [])

  // WebSocket callbacks
  const wsCallbacks = useMemo(() => ({
    onSessionCreated: (sessionId) => {
      dispatch({ type: ActionType.SET_SESSION, payload: sessionId })
    },
    
    onConnected: () => {
      dispatch({ type: ActionType.SET_STATE, payload: InterviewState.ACTIVE })
      isConnectedRef.current = true
      if (audioRecorderRef.current?.startRecording) {
        audioRecorderRef.current.startRecording()
      }
    },
    
    onDisconnected: (token) => {
      isConnectedRef.current = false
      if (audioRecorderRef.current?.stopRecording) {
        audioRecorderRef.current.stopRecording()
      }
      stopPlayback()
      if (token) {
        dispatch({ type: ActionType.SET_RESUMPTION_TOKEN, payload: token })
      }
      if (stateRef.current === InterviewState.ACTIVE) {
        dispatch({ type: ActionType.SET_STATE, payload: InterviewState.IDLE })
      }
    },
    
    onAudio: (data, mimeType) => {
      dispatch({ type: ActionType.SET_SPEAKING, payload: true })
      playAudio(data, mimeType)
    },
    
    onTranscript: handleTranscript,
    
    onTurnComplete: () => {
      // Don't set speaking to false - wait for audio to finish
    },
    
    onInterrupted: () => {
      dispatch({ type: ActionType.SET_SPEAKING, payload: false })
      stopPlayback()
      accumulatedAssistantTextRef.current = ''
      dispatch({ type: ActionType.CLEAR_CURRENT_TEXT, payload: 'assistant' })
    },
    
    onCallEnded: (reason, summary) => {
      dispatch({ type: ActionType.SET_END_DATA, payload: { reason, summary } })
      if (audioRecorderRef.current?.stopRecording) {
        audioRecorderRef.current.stopRecording()
      }
      stopPlayback()
    },
    
    onEvaluationSubmitted: (evaluation) => {
      dispatch({ type: ActionType.SET_EVALUATION, payload: evaluation })
    },
    
    onMaxDurationReached: () => {
      dispatch({ type: ActionType.SET_END_DATA, payload: { reason: 'time_limit', summary: 'Interview time limit reached.' } })
    },
    
    onError: (message) => {
      dispatch({ type: ActionType.SET_ERROR, payload: message })
    },
    
    onGoAway: (info) => {
      dispatch({ type: ActionType.SET_GO_AWAY, payload: info })
      setTimeout(() => dispatch({ type: ActionType.SET_GO_AWAY, payload: null }), 10000)
    },
    
    onSessionResumable: (token) => {
      dispatch({ type: ActionType.SET_RESUMPTION_TOKEN, payload: token })
    },
  }), [playAudio, stopPlayback, handleTranscript])

  // WebSocket
  const {
    connect,
    disconnect,
    sendAudio,
    sendMessage,
    sendInterrupt,
  } = useWebSocket({
    url: `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`,
    ...wsCallbacks,
  })

  // Recorder callbacks
  const handleAudioData = useCallback((base64Audio) => {
    if (isConnectedRef.current) {
      sendAudio(base64Audio)
    }
  }, [sendAudio])

  const handleRecordingStarted = useCallback(() => {
    dispatch({ type: ActionType.SET_RECORDING, payload: true })
  }, [])

  const handleRecordingStopped = useCallback(() => {
    dispatch({ type: ActionType.SET_RECORDING, payload: false })
  }, [])

  // Audio recorder
  const { startRecording, stopRecording, isSupported } = useAudioRecorder({
    onAudioData: handleAudioData,
    onStarted: handleRecordingStarted,
    onStopped: handleRecordingStopped,
    onAudioLevel: handleUserAudioLevel,
  })

  useEffect(() => {
    audioRecorderRef.current = { startRecording, stopRecording }
  }, [startRecording, stopRecording])

  // Start interview
  const startInterview = useCallback((config = {}) => {
    dispatch({ type: ActionType.SET_STATE, payload: InterviewState.CONNECTING })
    dispatch({ type: ActionType.SET_CONFIG, payload: config })
    
    connect()
    
    setTimeout(() => {
      sendMessage({
        type: 'config',
        config: {
          interviewId,
          systemPrompt: config.systemPrompt || 'You are a helpful AI assistant conducting an interview.',
          maxDuration: config.maxDuration || 1800,
          ...config,
        },
      })
    }, 500)
  }, [interviewId, connect, sendMessage])

  // End interview
  const endInterview = useCallback((reason = 'client_request') => {
    dispatch({ type: ActionType.SET_STATE, payload: InterviewState.ENDING })
    sendMessage({ type: 'end_call', reason })
    stopRecording()
    setTimeout(() => {
      disconnect()
      navigate(`/interview/${interviewId}/completed`)
    }, 1000)
  }, [sendMessage, stopRecording, disconnect, navigate, interviewId])

  // Interrupt
  const interrupt = useCallback(() => {
    sendInterrupt()
    stopPlayback()
  }, [sendInterrupt, stopPlayback])

  // Clear transcripts
  const clearTranscripts = useCallback(() => {
    dispatch({ type: ActionType.CLEAR_TRANSCRIPTS })
  }, [])

  // Cleanup
  useEffect(() => {
    return () => {
      if (userFinalTimerRef.current) clearTimeout(userFinalTimerRef.current)
      if (assistantFinalTimerRef.current) clearTimeout(assistantFinalTimerRef.current)
      disconnect()
      stopRecording()
      stopPlayback()
    }
  }, [disconnect, stopRecording, stopPlayback])

  const value = useMemo(() => ({
    ...state,
    interviewId,
    isAudioSupported: isSupported,
    startInterview,
    endInterview,
    interrupt,
    clearTranscripts,
  }), [state, interviewId, isSupported, startInterview, endInterview, interrupt, clearTranscripts])

  return (
    <InterviewContext.Provider value={value}>
      {children}
    </InterviewContext.Provider>
  )
}

// Hook
export function useInterview() {
  const context = useContext(InterviewContext)
  if (!context) {
    throw new Error('useInterview must be used within InterviewProvider')
  }
  return context
}

export default InterviewContext
