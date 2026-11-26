import { supabase, supabasePublishableKey } from './supabase';
import type { EventRecord } from './supabase';

export type EventFunctionAction = 'checkout' | 'status' | 'validate_ticket' | 'issue_complimentary' | 'health';

const pause = (ms: number) => new Promise(resolve => window.setTimeout(resolve, ms));

const valueFrom = (value: any, key: string) => value?.[key] ?? value?.data?.[key] ?? value?.result?.[key] ?? value?.data?.result?.[key];

function isTerminal(value: any) {
  const states = [
    value?.status,
    value?.payment_status,
    value?.booking?.booking_status,
    value?.payment?.status,
    value?.data?.status,
    value?.data?.payment_status,
    value?.data?.booking?.booking_status,
    value?.data?.payment?.status,
  ].filter(Boolean).map((state: any) => String(state).toLowerCase());

  return states.some((state: string) => [
    'completed', 'complete', 'success', 'successful', 'confirmed',
    'failed', 'cancelled', 'canceled', 'rejected', 'declined',
  ].includes(state));
}

function isPending(value: any) {
  if (isTerminal(value)) return false;
  const states = [
    value?.status,
    value?.payment_status,
    value?.booking?.booking_status,
    value?.payment?.status,
    value?.data?.status,
    value?.data?.payment_status,
    value?.data?.booking?.booking_status,
    value?.data?.payment?.status,
  ].filter(Boolean).map((state: any) => String(state).toLowerCase());

  return states.some((state: string) => [
    'pending', 'processing', 'queued', 'accepted', 'initiated', 'waiting', 'in_progress',
  ].includes(state));
}

export async function callEventFunction(
  event: Pick<EventRecord, 'id' | 'edge_function_url' | 'callback_url'>,
  action: EventFunctionAction,
  payload: Record<string, unknown> = {},
  requestId?: string,
  timeoutMs = 40000,
): Promise<any> {
  const endpoint = String(event.edge_function_url || '').trim();
  if (!endpoint) throw new Error('This event is not ready for online checkout. Please contact Tubuy Ticket support.');

  let parsed: URL;
  try {
    parsed = new URL(endpoint);
  } catch {
    throw new Error('This event payment connection is not configured correctly. Please contact support.');
  }
  if (parsed.protocol !== 'https:') throw new Error('This event payment connection is not secure. Please contact support.');

  const operationId = requestId || String(payload.request_id || payload.operation_id || crypto.randomUUID());
  const callbackUrl = String(event.callback_url || '').trim();
  if (callbackUrl) {
    let callback: URL;
    try { callback = new URL(callbackUrl); }
    catch { throw new Error('The event payment settings need attention. Please contact support.'); }
    if (callback.protocol !== 'https:') throw new Error('The event payment settings need attention. Please contact support.');
  }

  const { data: { session } } = await supabase.auth.getSession();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (session?.access_token) headers.Authorization = 'Bearer ' + session.access_token;
  if (parsed.hostname.endsWith('.supabase.co')) headers.apikey = supabasePublishableKey;

  const response = await fetch(parsed.toString(), {
    method: 'POST',
    mode: 'cors',
    credentials: 'omit',
    headers,
    signal: AbortSignal.timeout(Math.max(1, timeoutMs)),
    body: JSON.stringify({
      action,
      event_id: event.id,
      request_id: operationId,
      operation_id: operationId,
      ...(callbackUrl ? { callback_url: callbackUrl } : {}),
      ...payload,
    }),
  });

  const raw = await response.text();
  let result: any;
  try {
    result = raw ? JSON.parse(raw) : {};
  } catch {
    result = { error: raw || 'The event function returned an unreadable response.' };
  }

  const readableError = (value: any): string => {
    if (typeof value === 'string') return value;
    if (value && typeof value === 'object') return String(value.message || value.details || value.hint || JSON.stringify(value));
    return 'Something went wrong. Please try again.';
  };
  if (!response.ok) {
    throw new Error(readableError(result?.error || result?.message) || 'We could not complete that request. Please try again.');
  }
  if (result?.error) throw new Error(readableError(result.error));
  return result;
}

export async function waitForEventFunction(
  event: Pick<EventRecord, 'id' | 'edge_function_url' | 'callback_url'>,
  action: EventFunctionAction,
  payload: Record<string, unknown>,
  onWaiting?: (message: string) => void,
  maxWaitMs = 40000,
  onResult?: (result: any) => void,
): Promise<any> {
  const requestId = crypto.randomUUID();
  let result = await callEventFunction(event, action, payload, requestId, Math.max(1, maxWaitMs));
  onResult?.(result);
  if (!isPending(result)) return result;

  let bookingReference = valueFrom(result, 'booking_reference') || payload.booking_reference;
  let accessToken = valueFrom(result, 'access_token') || payload.access_token;
  const providerReference = valueFrom(result, 'provider_reference')
    || valueFrom(result, 'checkout_request_id')
    || payload.provider_reference;
  const endpoint = String(event.edge_function_url || '');
  const requiresBookingCredentials = /\/tubuy-payment(?:\?|$)/i.test(endpoint);

  if (requiresBookingCredentials && (!bookingReference || !accessToken)) {
    throw new Error('The payment service returned a pending response without its booking reference and access token. No status request was sent. Contact support before trying to pay again.');
  }

  onWaiting?.('Payment request received. Waiting for the M-PESA callback confirmation…');

  // Keep checking until the server reports a terminal payment state. A slow or
  // temporarily unavailable status endpoint must not turn a pending payment into failure.
  while (true) {
    await pause(2500);

    const statusPayload: Record<string, unknown> = {
      request_id: valueFrom(result, 'request_id') || valueFrom(result, 'operation_id') || requestId,
      operation_id: valueFrom(result, 'operation_id') || valueFrom(result, 'request_id') || requestId,
    };

    if (bookingReference) statusPayload.booking_reference = bookingReference;
    if (accessToken) statusPayload.access_token = accessToken;
    if (providerReference) statusPayload.provider_reference = providerReference;

    if (requiresBookingCredentials && (!statusPayload.booking_reference || !statusPayload.access_token)) {
      throw new Error('Payment status cannot be checked because the booking credentials are missing. No incomplete status request was sent.');
    }

    try {
      result = await callEventFunction(event, 'status', statusPayload, requestId, 15000);
    } catch (error) {
      onWaiting?.('Still waiting for the M-PESA confirmation. Reconnecting to check payment status…');
      continue;
    }

    bookingReference = valueFrom(result, 'booking_reference') || bookingReference;
    accessToken = valueFrom(result, 'access_token') || accessToken;
    onResult?.({
      ...result,
      ...(bookingReference ? { booking_reference: bookingReference } : {}),
      ...(accessToken ? { access_token: accessToken } : {}),
      ...(providerReference ? { provider_reference: providerReference } : {}),
    });

    if (!isPending(result)) return result;
    onWaiting?.('M-PESA prompt received. Payment is still pending; checking again for the callback…');
  }
}
