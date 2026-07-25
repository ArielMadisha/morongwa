'use client';

import { Call, Device } from '@twilio/voice-sdk';

let sharedDevice: Device | null = null;

export type MorongwaCallPhase = 'idle' | 'connecting' | 'ringing' | 'connected' | 'ended' | 'error';

async function ensureDevice(token: string): Promise<Device> {
  if (!sharedDevice) {
    sharedDevice = new Device(token, {
      codecPreferences: [Call.Codec.Opus, Call.Codec.PCMU],
      logLevel: 'error',
    });
  } else {
    await sharedDevice.updateToken(token);
  }

  if (sharedDevice.state !== Device.State.Registered) {
    await sharedDevice.register();
  }

  return sharedDevice;
}

export async function connectMorongwaPstn(params: {
  token: string;
  to: string;
  callId: string;
  onPhase?: (phase: MorongwaCallPhase) => void;
}): Promise<Call> {
  params.onPhase?.('connecting');

  const device = await ensureDevice(params.token);
  const call = await device.connect({
    params: {
      To: params.to.replace(/\s/g, ""),
      CallId: params.callId,
    },
  });

  call.on('ringing', () => params.onPhase?.('ringing'));
  call.on('accept', () => params.onPhase?.('connected'));
  call.on('disconnect', () => params.onPhase?.('ended'));
  call.on('cancel', () => params.onPhase?.('ended'));
  call.on('error', (err) => {
    console.error('[Morongwa Voice]', err);
    params.onPhase?.('error');
  });

  return call;
}

export function hangupMorongwaCall(call: Call | null | undefined) {
  try {
    call?.disconnect();
  } catch {
    /* ignore */
  }
}

export function destroyMorongwaVoiceDevice() {
  try {
    sharedDevice?.destroy();
  } catch {
    /* ignore */
  }
  sharedDevice = null;
}
