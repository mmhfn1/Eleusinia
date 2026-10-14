// Which audio device a call uses, with no DOM imports so it can be unit tested.

export type Device = { kind: string; deviceId: string; label?: string }

// Chromium on Windows lists entries that follow whichever device the system currently uses. They are not
// a device in their own right, so a name match must never land on one.
const virtual = (d: Device) => d.deviceId === 'default' || d.deviceId === 'communications' || /^(Default|Communications) - /.test(d.label ?? '')

// The device to use for a setting: the chosen one while it is plugged in, otherwise the system default ('').
// Before microphone permission the list has no ids and cannot tell, so the choice is trusted.
export function usable(chosen: string, kind: string, devices: Device[], label = '') {
  const own = devices.filter((d) => d.kind === kind && d.deviceId)
  if (!chosen || !own.length || own.some((d) => d.deviceId === chosen)) return chosen
  // Ids can change while the name stays (a reinstalled driver, a headset paired again), so match the name.
  return (label && own.find((d) => !virtual(d) && d.label === label)?.deviceId) || ''
}

// What to switch to after the device list changed, or null to keep the device in use.
// Falls back to the default when the chosen device disappears, and back to it when it returns.
export function nextDevice(chosen: string, inUse: string, kind: string, devices: Device[], label = '') {
  const use = usable(chosen, kind, devices, label)
  return use === inUse ? null : use
}

// Whether the call is on the default only because the chosen device is unplugged; shown as a notice.
export const fellBack = (chosen: string, inUse: string) => !!chosen && !inUse
