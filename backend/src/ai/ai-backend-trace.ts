/**
 * AIVA Backend Trace - Structured Diagnostic Logging
 */

export interface AivaBackendTrace {
  requestId: string;
  messageCategory: string;
  authenticated: boolean;
  deviceAuthorized: boolean;
  route: string;
  mode: string;
  provider_selected: string;
  model_selected: string;
  provider_request_started: number;
  provider_response_status: string | number;
  provider_latency: number;
  provider_response_valid: boolean;
  tool_selected: string;
  tool_execution: string;
  final_response_generated: boolean;
  total_latency: number;
  failure_stage: string;
  failure_type: string;
  failure_message: string;
}

export function createDefaultTrace(requestId: string): AivaBackendTrace {
  return {
    requestId,
    messageCategory: 'unknown',
    authenticated: false,
    deviceAuthorized: false,
    route: 'unknown',
    mode: 'unknown',
    provider_selected: 'none',
    model_selected: 'none',
    provider_request_started: 0,
    provider_response_status: 'none',
    provider_latency: 0,
    provider_response_valid: false,
    tool_selected: 'none',
    tool_execution: 'none',
    final_response_generated: false,
    total_latency: 0,
    failure_stage: 'none',
    failure_type: 'none',
    failure_message: 'none',
  };
}

export function printAivaBackendTrace(t: AivaBackendTrace): void {
  console.log(`[AIVA BACKEND TRACE]
requestId=${t.requestId}
messageCategory=${t.messageCategory}
authenticated=${t.authenticated}
deviceAuthorized=${t.deviceAuthorized}
route=${t.route}
mode=${t.mode}
provider_selected=${t.provider_selected}
model_selected=${t.model_selected}
provider_request_started=${t.provider_request_started}
provider_response_status=${t.provider_response_status}
provider_latency=${t.provider_latency}
provider_response_valid=${t.provider_response_valid}
tool_selected=${t.tool_selected}
tool_execution=${t.tool_execution}
final_response_generated=${t.final_response_generated}
total_latency=${t.total_latency}
failure_stage=${t.failure_stage}
failure_type=${t.failure_type}
failure_message=${t.failure_message}`);
}
