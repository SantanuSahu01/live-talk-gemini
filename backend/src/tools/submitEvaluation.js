/**
 * Submit Evaluation Tool
 * Allows AI to submit the final interview evaluation
 */

/**
 * Create evaluation tool definition with dynamic schema
 * @param {object} evaluationSchema - Custom evaluation fields
 * @returns {object} Tool definition
 */
export function createEvaluationTool(evaluationSchema = null) {
  // Default evaluation schema
  const defaultProperties = {
    overallScore: {
      type: 'number',
      description: 'Overall interview score from 1-10'
    },
    recommendation: {
      type: 'string',
      enum: ['strong_hire', 'hire', 'no_hire', 'strong_no_hire'],
      description: 'Hiring recommendation'
    },
    technicalSkills: {
      type: 'number',
      description: 'Technical skills score from 1-10'
    },
    communication: {
      type: 'number',
      description: 'Communication skills score from 1-10'
    },
    problemSolving: {
      type: 'number',
      description: 'Problem solving abilities score from 1-10'
    },
    cultureFit: {
      type: 'number',
      description: 'Cultural fit score from 1-10'
    },
    strengths: {
      type: 'array',
      items: { type: 'string' },
      description: 'List of candidate strengths'
    },
    areasForImprovement: {
      type: 'array',
      items: { type: 'string' },
      description: 'Areas where candidate could improve'
    },
    summary: {
      type: 'string',
      description: 'Detailed evaluation summary'
    },
    notes: {
      type: 'string',
      description: 'Additional notes or observations'
    }
  };
  
  // Build properties from custom schema if provided
  let properties = defaultProperties;
  let required = ['overallScore', 'recommendation', 'summary'];
  
  if (evaluationSchema && Object.keys(evaluationSchema).length > 0) {
    properties = {};
    required = [];
    
    for (const [key, spec] of Object.entries(evaluationSchema)) {
      // Parse spec string like "number 1-10" or "string" or "boolean"
      if (typeof spec === 'string') {
        const specLower = spec.toLowerCase();
        
        if (specLower.includes('number')) {
          properties[key] = { type: 'number', description: key };
          
          // Check for range
          const rangeMatch = spec.match(/(\d+)-(\d+)/);
          if (rangeMatch) {
            properties[key].description = `${key} (${rangeMatch[1]}-${rangeMatch[2]})`;
          }
        } else if (specLower.includes('boolean')) {
          properties[key] = { type: 'boolean', description: key };
        } else if (specLower.includes('array')) {
          properties[key] = { 
            type: 'array', 
            items: { type: 'string' },
            description: key 
          };
        } else {
          properties[key] = { type: 'string', description: key };
        }
        
        // Mark as required if specified
        if (specLower.includes('required')) {
          required.push(key);
        }
      } else if (typeof spec === 'object') {
        properties[key] = spec;
        if (spec.required) {
          required.push(key);
        }
      }
    }
    
    // Ensure at least summary is required
    if (!properties.summary) {
      properties.summary = { type: 'string', description: 'Evaluation summary' };
    }
    if (!required.includes('summary')) {
      required.push('summary');
    }
  }
  
  return {
    name: 'submit_evaluation',
    description: 'Submit the final interview evaluation. Call this after completing the interview to provide assessment of the candidate.',
    parameters: {
      type: 'object',
      properties,
      required
    }
  };
}

/**
 * Default evaluation tool
 */
export const submitEvaluationTool = createEvaluationTool();

/**
 * Handle submit_evaluation tool execution
 * @param {object} args - Evaluation data
 * @param {object} context - Execution context
 * @returns {object} Tool response
 */
export async function handleSubmitEvaluation(args, context) {
  const { sessionId, interviewId, logger, queueService, emit } = context;
  
  logger.info({ 
    interviewId,
    recommendation: args.recommendation,
    score: args.overallScore 
  }, 'Evaluation submitted');
  
  const evaluation = {
    interviewId,
    sessionId,
    evaluation: args,
    submittedAt: new Date().toISOString(),
    submittedBy: 'ai'
  };
  
  // Publish to queue if available
  if (queueService) {
    try {
      await queueService.publishEvaluation(evaluation);
      logger.info('Evaluation published to queue');
    } catch (error) {
      logger.error({ error: error.message }, 'Failed to publish evaluation');
      // Continue - don't fail the tool call
    }
  }
  
  // Emit event
  emit('evaluationSubmitted', evaluation);
  
  return {
    success: true,
    message: 'Evaluation submitted successfully',
    interviewId,
    timestamp: evaluation.submittedAt
  };
}

export default {
  definition: submitEvaluationTool,
  createDefinition: createEvaluationTool,
  handler: handleSubmitEvaluation
};

