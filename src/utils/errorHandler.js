// Error handler utilities for consistent error reporting

export const ErrorCategory = {
  MUSIC: 'music',
  AGENT: 'agent',
  STORAGE: 'storage',
  PERMISSION: 'permission',
  VALIDATION: 'validation',
  VOICE: 'voice',
  UNKNOWN: 'unknown'
};

export const ErrorSeverity = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical'
};

export function handleInteractionError(error, context = {}) {
  const timestamp = new Date().toISOString();
  const category = context.category || ErrorCategory.UNKNOWN;
  
  console.error(`[${timestamp}] ${category.toUpperCase()}_ERROR:`, {
    message: error.message,
    stack: error.stack,
    context
  });
}

export function handleSafeError(error, interaction, fallbackMessage = 'An error occurred') {
  handleInteractionError(error, { interaction: interaction?.id });
  
  if (interaction?.isRepliable?.()) {
    return interaction.reply({
      content: fallbackMessage,
      ephemeral: true
    }).catch(e => console.error('Failed to reply with error:', e.message));
  }
}

export function handleCriticalError(error, context = {}) {
  const timestamp = new Date().toISOString();
  console.error(`[${timestamp}] CRITICAL_ERROR:`, {
    message: error.message,
    stack: error.stack,
    context
  });
}

export function handleVoiceError(error, context = {}) {
  const timestamp = new Date().toISOString();
  const severity = context.severity || ErrorSeverity.MEDIUM;
  
  console.error(`[${timestamp}] VOICE_ERROR [${severity}]:`, {
    message: error.message,
    stack: error.stack,
    context
  });
}
