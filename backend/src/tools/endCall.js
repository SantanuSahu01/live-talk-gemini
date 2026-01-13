/**
 * End Call Tool
 * Allows AI to end the interview call
 */

export const endCallTool = {
  name: 'end_call',
  description: 'End the interview call. Use this when the interview is complete, the candidate requests to end, or there is a technical issue that prevents continuing.',
  parameters: {
    type: 'object',
    properties: {
      reason: {
        type: 'string',
        enum: ['completed', 'candidate_request', 'technical_issue', 'time_limit'],
        description: 'The reason for ending the call'
      },
      summary: {
        type: 'string',
        description: 'A brief summary of the interview or reason for ending'
      }
    },
    required: ['reason', 'summary']
  }
};

/**
 * Handle end_call tool execution
 * @param {object} args - Tool arguments
 * @param {object} context - Execution context
 * @returns {object} Tool response
 */
export async function handleEndCall(args, context) {
  const { reason, summary } = args;
  const { sessionId, logger, emit } = context;
  
  logger.info({ reason, summary }, 'End call tool executed');
  
  // Emit event for session to handle
  emit('callEnded', {
    sessionId,
    reason,
    summary,
    endedBy: 'ai',
    timestamp: new Date().toISOString()
  });
  
  return {
    success: true,
    message: `Call ended: ${reason}`,
    summary
  };
}

export default {
  definition: endCallTool,
  handler: handleEndCall
};

