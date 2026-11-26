import { useCallback, useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser';
import { Camera, CameraOff, CheckCircle2, ScanLine, XCircle } from 'lucide-react';
import type { EventRecord } from '../lib/supabase';
import { callEventFunction } from '../lib/eventFunction';

type ScanResult = {
  valid: boolean;
  result: string;
  message: string;
  ticket_code?: string;
  holder_name?: string;
  ticket_type?: string;
  event_name?: string;
  [key: string]: unknown;
};

function extractTicketCode(rawValue: string): string {
  const raw = String(rawValue || '').trim();
  if (!raw) throw new Error('The QR code is empty. Try scanning again.');

  try {
    const parsed = JSON.parse(raw);
    const value = parsed?.ticket_code ?? parsed?.ticketCode ?? parsed?.code ?? parsed?.ticket?.ticket_code;
    if (value) return String(value).trim();
  } catch {
    // QR codes normally contain a plain ticket code, not JSON.
  }

  try {
    const url = new URL(raw);
    const fromQuery = url.searchParams.get('ticket_code')
      || url.searchParams.get('ticketCode')
      || url.searchParams.get('code')
      || url.searchParams.get('ticket');
    if (fromQuery) return fromQuery.trim();
    const fromHash = new URLSearchParams(url.hash.replace(/^#\/?/, ''));
    const hashCode = fromHash.get('ticket_code') || fromHash.get('code');
    if (hashCode) return hashCode.trim();
    const lastPart = decodeURIComponent(url.pathname.split('/').filter(Boolean).pop() || '');
    if (lastPart) return lastPart;
  } catch {
    // Not a URL; continue with the raw value.
  }

  const match = raw.match(/TBT-[A-Z0-9-]+/i);
  if (match) return match[0].toUpperCase();

  if (/^[A-Z0-9][A-Z0-9_-]{4,99}$/i.test(raw)) return raw;
  throw new Error('This QR code does not contain a recognizable Tubuy ticket number.');
}

function normalizeResult(response: any, scannedCode: string): ScanResult {
  const nested = response?.data && typeof response.data === 'object' ? response.data : {};
  const payload = { ...response, ...nested };
  const status = String(payload.result || payload.status || payload.ticket_status || '').toLowerCase();
  const duplicate = ['already_used', 'already_scanned', 'duplicate', 'checked_in', 'used'].includes(status);
  const accepted = payload.valid === true
    || payload.success === true
    || ['accepted', 'valid', 'success', 'successful', 'checked_in_now'].includes(status);

  return {
    ...payload,
    valid: accepted && !duplicate,
    result: duplicate ? 'already_used' : accepted ? 'accepted' : status || 'invalid',
    message: String(payload.message || (duplicate
      ? 'This ticket has already been checked in. Do not admit it again.'
      : accepted
        ? 'This ticket is valid. Entry has been recorded.'
        : 'This ticket was not accepted. Check the code and selected event.')),
    ticket_code: String(payload.ticket_code || payload.code || scannedCode),
  };
}

export default function TicketScanner({ events }: { events: EventRecord[] }) {
  const [code, setCode] = useState('');
  const [result, setResult] = useState<ScanResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [cameraMessage, setCameraMessage] = useState('');
  const [eventId, setEventId] = useState(events[0]?.id || '');
  const [cameraOn, setCameraOn] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const scanLockRef = useRef(false);

  const selectedEvent = events.find(event => event.id === eventId) || null;

  const stopCamera = useCallback(() => {
    controlsRef.current?.stop();
    controlsRef.current = null;
    const video = videoRef.current;
    if (video?.srcObject instanceof MediaStream) {
      video.srcObject.getTracks().forEach(track => track.stop());
      video.srcObject = null;
    }
    readerRef.current = null;
    scanLockRef.current = false;
    setCameraOn(false);
  }, []);

  const validate = useCallback(async (ticketCode: string) => {
    let normalized: string;
    try {
      normalized = extractTicketCode(ticketCode);
    } catch (error: any) {
      setResult({ valid: false, result: 'invalid', message: error.message || 'Enter a valid ticket number.' });
      return;
    }
    if (busy) return;
    if (!selectedEvent) {
      setResult({ valid: false, result: 'error', message: 'Choose the event for this scan.' });
      return;
    }
    if (!selectedEvent.edge_function_url) {
      setResult({ valid: false, result: 'error', message: 'This event has no Edge Function URL configured. Ask the Super Admin to configure its ticket validation endpoint.' });
      return;
    }

    setBusy(true);
    setResult(null);
    try {
      const response = await callEventFunction(selectedEvent, 'validate_ticket', {
        ticket_code: normalized,
        scanned_value: normalized,
        source: 'entry_scanner',
      });
      setResult(normalizeResult(response, normalized));
      setCode('');
    } catch (error: any) {
      setResult({
        valid: false,
        result: 'error',
        ticket_code: normalized,
        message: error?.message || 'Could not validate this ticket. Check your connection and try again.',
      });
    } finally {
      setBusy(false);
    }
  }, [busy, selectedEvent]);

  useEffect(() => {
    if (!events.some(event => event.id === eventId) && events[0]) setEventId(events[0].id);
  }, [events, eventId]);

  useEffect(() => () => {
    controlsRef.current?.stop();
    const stream = videoRef.current?.srcObject;
    if (stream instanceof MediaStream) stream.getTracks().forEach(track => track.stop());
  }, []);

  const startCamera = async () => {
    if (cameraOn || busy) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraMessage('Camera access requires HTTPS and browser permission. Enter the ticket number manually instead.');
      return;
    }

    try {
      setCameraMessage('Starting camera…');
      scanLockRef.current = false;
      const reader = new BrowserMultiFormatReader();
      readerRef.current = reader;
      const devices = await reader.listVideoInputDevices();
      const preferred = devices.find(device => /back|rear|environment|world/i.test(device.label)) || devices[0];
      if (!videoRef.current) throw new Error('The camera preview is not ready. Please try again.');

      setCameraOn(true);
      setCameraMessage('Point the camera at the ticket QR code.');
      const controls = await reader.decodeFromVideoDevice(
        preferred?.deviceId,
        videoRef.current,
        (decoded, scanError) => {
          if (decoded && !scanLockRef.current) {
            scanLockRef.current = true;
            const scannedValue = decoded.getText();
            stopCamera();
            void validate(scannedValue);
          } else if (scanError && scanError.name !== 'NotFoundException' && scanError.name !== 'ChecksumException' && scanError.name !== 'FormatException') {
            setCameraMessage('Keep the QR code steady and inside the camera view, or enter the ticket number manually.');
          }
        },
      );
      controlsRef.current = controls;
    } catch (error: any) {
      stopCamera();
      setCameraMessage(error?.name === 'NotAllowedError'
        ? 'Camera permission was denied. Allow camera access in your browser settings, or enter the ticket number manually.'
        : error?.message || 'Could not open the camera. Enter the ticket number manually.');
    }
  };

  return (
    <section className="scanner-panel">
      <div className="dash-title">
        <h2>Scan a ticket</h2>
        <p>Choose the event, scan its QR code or enter the ticket number. Each scan is verified by that event’s configured Edge Function.</p>
      </div>

      {events.length > 0 && (
        <label className="field">
          <span>Event to validate</span>
          <select value={eventId} onChange={event => { setEventId(event.target.value); setResult(null); }}>
            {events.map(event => <option key={event.id} value={event.id}>{event.name} · {event.event_date}</option>)}
          </select>
        </label>
      )}

      <div className="scanner-tools">
        <input
          value={code}
          onChange={event => setCode(event.target.value)}
          placeholder="Enter or paste ticket number (e.g. TBT-…)"
          aria-label="Ticket number"
          autoComplete="off"
          onKeyDown={event => { if (event.key === 'Enter') void validate(code); }}
        />
        <button type="button" disabled={busy || !code.trim() || !selectedEvent} onClick={() => void validate(code)}>
          {busy ? 'Checking…' : 'Validate ticket'}
        </button>
      </div>

      <div className="scanner-tools">
        {!cameraOn
          ? <button type="button" disabled={busy || !selectedEvent} onClick={() => void startCamera()}><Camera size={15}/> Open QR camera</button>
          : <button type="button" onClick={stopCamera}><CameraOff size={15}/> Stop camera</button>}
        <span className="muted" role="status" aria-live="polite">{cameraMessage}</span>
      </div>

      <video ref={videoRef} className="scanner-video" playsInline muted hidden={!cameraOn} />

      {result && (
        <div className={'scan-result ' + (result.valid ? '' : 'invalid')} role="status" aria-live="polite">
          {result.valid ? <CheckCircle2/> : <XCircle/>}
          <b>{result.valid ? 'Entry accepted' : result.result === 'already_used' ? 'Duplicate entry blocked' : 'Ticket not accepted'}</b>
          <p>{result.message}</p>
          {result.ticket_code && <p><strong>{result.ticket_code}</strong>{result.holder_name ? ' · ' + result.holder_name : ''}{result.ticket_type ? ' · ' + result.ticket_type : ''}</p>}
          {result.event_name && <p>{result.event_name}</p>}
        </div>
      )}

      {!events.length && <p className="muted">No assigned events were found for this account. Ask the event organizer to add your account as event staff.</p>}
      {selectedEvent && !selectedEvent.edge_function_url && <p className="ticket-download-error">This event has no Edge Function URL configured. Ask the Super Admin to add its endpoint before scanning.</p>}
    </section>
  );
}
