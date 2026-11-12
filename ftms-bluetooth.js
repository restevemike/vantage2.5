export const FTMS_UUID = {
  service: 0x1826,
  feature: 0x2acc,
  treadmillData: 0x2acd,
  crossTrainerData: 0x2ace,
  stepClimberData: 0x2acf,
  stairClimberData: 0x2ad0,
  trainingStatus: 0x2ad3
};

function u24(view, offset) {
  return view.getUint8(offset) | (view.getUint8(offset + 1) << 8) | (view.getUint8(offset + 2) << 16);
}

function has(view, offset, bytes) {
  return offset + bytes <= view.byteLength;
}

function numberOrNull(value, unavailable) {
  return value === unavailable ? null : value;
}

export function bytesToHex(view) {
  const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
  return [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join(' ');
}

export function parseTreadmillData(value) {
  const view = value instanceof DataView ? value : new DataView(value.buffer || value);
  if (view.byteLength < 2) return { machineType: 'treadmill', rawHex: bytesToHex(view), parseWarning: 'Packet shorter than FTMS flags field.' };
  const flags = view.getUint16(0, true);
  let offset = 2;
  const out = { machineType: 'treadmill', flags, rawHex: bytesToHex(view) };
  // FTMS bit 0 is inverse: 0 means the mandatory instantaneous speed is present.
  if (!(flags & (1 << 0)) && has(view, offset, 2)) { out.instantaneousSpeedKmh = view.getUint16(offset, true) / 100; offset += 2; }
  if ((flags & (1 << 1)) && has(view, offset, 2)) { out.averageSpeedKmh = view.getUint16(offset, true) / 100; offset += 2; }
  if ((flags & (1 << 2)) && has(view, offset, 3)) { out.totalDistanceMetres = u24(view, offset); out.distanceKm = out.totalDistanceMetres / 1000; offset += 3; }
  if ((flags & (1 << 3)) && has(view, offset, 4)) {
    out.inclinePercent = numberOrNull(view.getInt16(offset, true), 0x7fff); if (out.inclinePercent != null) out.inclinePercent /= 10; offset += 2;
    out.rampAngleDegrees = numberOrNull(view.getInt16(offset, true), 0x7fff); if (out.rampAngleDegrees != null) out.rampAngleDegrees /= 10; offset += 2;
  }
  if ((flags & (1 << 4)) && has(view, offset, 4)) { out.positiveElevationGainMetres = view.getUint16(offset, true); out.negativeElevationGainMetres = view.getUint16(offset + 2, true); offset += 4; }
  if ((flags & (1 << 5)) && has(view, offset, 1)) { const raw = view.getUint8(offset++); out.instantaneousPaceMinPerKm = raw === 0xff ? null : raw / 10; }
  if ((flags & (1 << 6)) && has(view, offset, 1)) { const raw = view.getUint8(offset++); out.averagePaceMinPerKm = raw === 0xff ? null : raw / 10; }
  if ((flags & (1 << 7)) && has(view, offset, 5)) {
    const total = view.getUint16(offset, true), perHour = view.getUint16(offset + 2, true), perMin = view.getUint8(offset + 4); offset += 5;
    out.totalEnergyKcal = total === 0xffff ? null : total;
    out.energyPerHourKcal = perHour === 0xffff ? null : perHour;
    out.energyPerMinuteKcal = perMin === 0xff ? null : perMin;
  }
  if ((flags & (1 << 8)) && has(view, offset, 1)) { const raw = view.getUint8(offset++); out.heartRateBpm = raw === 0xff ? null : raw; }
  if ((flags & (1 << 9)) && has(view, offset, 1)) { const raw = view.getUint8(offset++); out.metabolicEquivalent = raw === 0xff ? null : raw / 10; }
  if ((flags & (1 << 10)) && has(view, offset, 2)) { const raw = view.getUint16(offset, true); offset += 2; out.elapsedSeconds = raw === 0xffff ? null : raw; }
  if ((flags & (1 << 11)) && has(view, offset, 2)) { const raw = view.getUint16(offset, true); offset += 2; out.remainingSeconds = raw === 0xffff ? null : raw; }
  if ((flags & (1 << 12)) && has(view, offset, 4)) {
    const force = view.getInt16(offset, true), power = view.getInt16(offset + 2, true); offset += 4;
    out.forceOnBeltNewtons = force === 0x7fff ? null : force;
    out.powerWatts = power === 0x7fff ? null : power;
  }
  out.bytesParsed = offset;
  if (offset < view.byteLength) out.unparsedBytes = view.byteLength - offset;
  return out;
}

function parseClimber(value, machineType) {
  const view = value instanceof DataView ? value : new DataView(value.buffer || value);
  if (view.byteLength < 2) return { machineType, rawHex: bytesToHex(view), parseWarning: 'Packet shorter than FTMS flags field.' };
  const flags = view.getUint16(0, true);
  let offset = 2;
  const out = { machineType, flags, rawHex: bytesToHex(view) };
  // Mandatory floors is present when More Data bit is 0.
  if (!(flags & 1) && has(view, offset, 2)) { out.floors = view.getUint16(offset, true); offset += 2; }
  if (machineType === 'step-climber' && !(flags & 1) && has(view, offset, 2)) { out.stepCount = view.getUint16(offset, true); offset += 2; }
  if ((flags & (1 << 1)) && has(view, offset, 2)) { const raw = view.getUint16(offset, true); offset += 2; out.stepsPerMinute = raw === 0xffff ? null : raw; }
  if ((flags & (1 << 2)) && has(view, offset, 2)) { const raw = view.getUint16(offset, true); offset += 2; out.averageStepRate = raw === 0xffff ? null : raw; }
  if ((flags & (1 << 3)) && has(view, offset, 2)) { const raw = view.getUint16(offset, true); offset += 2; out.positiveElevationGainMetres = raw === 0xffff ? null : raw; }
  if (machineType === 'stair-climber' && (flags & (1 << 4)) && has(view, offset, 2)) { const raw = view.getUint16(offset, true); offset += 2; out.strideCount = raw === 0xffff ? null : raw; }
  const energyBit = machineType === 'stair-climber' ? 5 : 4;
  const heartBit = machineType === 'stair-climber' ? 6 : 5;
  const metBit = machineType === 'stair-climber' ? 7 : 6;
  const elapsedBit = machineType === 'stair-climber' ? 8 : 7;
  const remainingBit = machineType === 'stair-climber' ? 9 : 8;
  if ((flags & (1 << energyBit)) && has(view, offset, 5)) {
    const total = view.getUint16(offset, true), perHour = view.getUint16(offset + 2, true), perMin = view.getUint8(offset + 4); offset += 5;
    out.totalEnergyKcal = total === 0xffff ? null : total;
    out.energyPerHourKcal = perHour === 0xffff ? null : perHour;
    out.energyPerMinuteKcal = perMin === 0xff ? null : perMin;
  }
  if ((flags & (1 << heartBit)) && has(view, offset, 1)) { const raw = view.getUint8(offset++); out.heartRateBpm = raw === 0xff ? null : raw; }
  if ((flags & (1 << metBit)) && has(view, offset, 1)) { const raw = view.getUint8(offset++); out.metabolicEquivalent = raw === 0xff ? null : raw / 10; }
  if ((flags & (1 << elapsedBit)) && has(view, offset, 2)) { const raw = view.getUint16(offset, true); offset += 2; out.elapsedSeconds = raw === 0xffff ? null : raw; }
  if ((flags & (1 << remainingBit)) && has(view, offset, 2)) { const raw = view.getUint16(offset, true); offset += 2; out.remainingSeconds = raw === 0xffff ? null : raw; }
  out.bytesParsed = offset;
  if (offset < view.byteLength) out.unparsedBytes = view.byteLength - offset;
  return out;
}

export function parseStairClimberData(value) { return parseClimber(value, 'stair-climber'); }
export function parseStepClimberData(value) { return parseClimber(value, 'step-climber'); }

export function ftmsAvailable() {
  return typeof navigator !== 'undefined' && Boolean(navigator.bluetooth?.requestDevice);
}

export class FtmsMachineClient {
  constructor({ onUpdate = () => {}, onStatus = () => {} } = {}) {
    this.onUpdate = onUpdate;
    this.onStatus = onStatus;
    this.device = null;
    this.server = null;
    this.characteristic = null;
    this.machineType = null;
    this.samples = [];
    this.boundChanged = event => this.handleChanged(event);
    this.boundDisconnected = () => this.handleDisconnected();
  }

  status(status, extra = {}) { this.onStatus({ status, ...extra }); }

  async connect(preferredActivity = '') {
    if (!ftmsAvailable()) throw new Error('Web Bluetooth is not available in this browser.');
    this.status('requesting-device');
    this.device = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: [FTMS_UUID.service, 0x180a, 0x180d]
    });
    this.device.addEventListener('gattserverdisconnected', this.boundDisconnected);
    this.status('connecting', { deviceName: this.device.name || 'Bluetooth fitness machine' });
    this.server = await this.device.gatt.connect();
    let service;
    try { service = await this.server.getPrimaryService(FTMS_UUID.service); }
    catch { throw new Error('The selected device did not expose the standard Bluetooth FTMS service. Keep using console screenshots for this machine.'); }

    const preference = preferredActivity === 'stairmaster'
      ? [[FTMS_UUID.stairClimberData, 'stair-climber'], [FTMS_UUID.stepClimberData, 'step-climber'], [FTMS_UUID.treadmillData, 'treadmill']]
      : [[FTMS_UUID.treadmillData, 'treadmill'], [FTMS_UUID.stairClimberData, 'stair-climber'], [FTMS_UUID.stepClimberData, 'step-climber']];
    let characteristic = null;
    for (const [uuid, type] of preference) {
      try { characteristic = await service.getCharacteristic(uuid); this.machineType = type; break; } catch { /* try next standard characteristic */ }
    }
    if (!characteristic) throw new Error('FTMS was found, but no supported treadmill/stair-climber data characteristic was exposed.');
    this.characteristic = characteristic;
    await characteristic.startNotifications();
    characteristic.addEventListener('characteristicvaluechanged', this.boundChanged);
    this.status('connected', { deviceName: this.device.name || 'Bluetooth fitness machine', machineType: this.machineType, characteristicUuid: characteristic.uuid });
    if (characteristic.value) this.handleValue(characteristic.value);
    return this.snapshot();
  }

  handleChanged(event) { if (event?.target?.value) this.handleValue(event.target.value); }

  handleValue(value) {
    let parsed;
    if (this.machineType === 'treadmill') parsed = parseTreadmillData(value);
    else if (this.machineType === 'step-climber') parsed = parseStepClimberData(value);
    else parsed = parseStairClimberData(value);
    const sample = { ...parsed, capturedAt: new Date().toISOString() };
    this.samples.push(sample);
    if (this.samples.length > 600) this.samples.splice(0, this.samples.length - 600);
    this.onUpdate(sample, this.snapshot());
  }

  snapshot() {
    const latest = this.samples.at(-1) || null;
    return {
      profile: 'FTMS',
      serviceUuid: '1826',
      deviceId: this.device?.id || null,
      deviceName: this.device?.name || null,
      machineType: this.machineType,
      characteristicUuid: this.characteristic?.uuid || null,
      connected: Boolean(this.device?.gatt?.connected),
      sampleCount: this.samples.length,
      firstSampleAt: this.samples[0]?.capturedAt || null,
      lastSampleAt: latest?.capturedAt || null,
      latest,
      samples: this.samples.slice(-120)
    };
  }

  async disconnect() {
    try {
      if (this.characteristic) {
        this.characteristic.removeEventListener('characteristicvaluechanged', this.boundChanged);
        if (this.characteristic.stopNotifications) await this.characteristic.stopNotifications();
      }
    } catch { /* disconnect should remain best effort */ }
    if (this.device?.gatt?.connected) this.device.gatt.disconnect();
    this.status('disconnected', { deviceName: this.device?.name || null, machineType: this.machineType });
  }

  handleDisconnected() { this.status('disconnected', { deviceName: this.device?.name || null, machineType: this.machineType }); }
}
