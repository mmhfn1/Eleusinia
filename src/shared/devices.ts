// Which audio device a call uses, with no DOM imports so it can be unit tested.

export type Device = { kind: string; deviceId: string }

// The device to use for a setting: the chosen one while it is plugged in, otherwise the system default ('').
// Before microphone permission the list has no ids and cannot tell, so the choice is trusted.
export function usable(chosen: string, kind: string, devices: Device[]) {
  const ids = devices.filter((d) => d.kind === kind && d.deviceId).map((d) => d.deviceId)
  return !chosen || !ids.length || ids.includes(chosen) ? chosen : ''
}

// What to switch to after the device list changed, or null to keep the device in use.
// Falls back to the default when the chosen device disappears, and back to it when it returns.
export function nextDevice(chosen: string, inUse: string, kind: string, devices: Device[]) {
  const use = usable(chosen, kind, devices)
  return use === inUse ? null : use
}

// Whether the call is on the default only because the chosen device is unplugged; shown as a notice.
export const fellBack = (chosen: string, inUse: string) => !!chosen && inUse !== chosen
