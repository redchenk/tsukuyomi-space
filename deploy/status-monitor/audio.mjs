// Check two contiguous complete MPEG Layer III frames, including audio with an ID3v2 prefix.
export function hasMp3Frames(bytes) {
  let offset = 0;
  if (bytes.subarray(0, 3).toString() === 'ID3') {
    if (bytes.length < 10 || bytes.subarray(6, 10).some(value => value > 127)) return false;
    const tagLength = bytes.subarray(6, 10).reduce((size, next) => size * 128 + next, 0);
    offset = 10 + tagLength + (bytes[3] === 4 && (bytes[5] & 16) ? 10 : 0);
  }
  for (let frame = 0; frame < 2; frame++) {
    if (offset + 4 > bytes.length || bytes[offset] !== 255) return false;
    const control = bytes[offset + 1];
    const version = (control >> 3) & 3;
    if ((control & 224) !== 224 || version === 1 || (control & 6) !== 2) return false;
    const rate = bytes[offset + 2];
    const sampleRate = [44100, 48000, 32000][(rate >> 2) & 3] / (version === 3 ? 1 : version === 2 ? 2 : 4);
    const bitrates = version === 3 ? [0,32,40,48,56,64,80,96,112,128,160,192,224,256,320]
                                   : [0,8,16,24,32,40,48,56,64,80,96,112,128,144,160];
    const bitrate = bitrates[rate >> 4];
    if (!sampleRate || !bitrate) return false;
    offset += Math.floor((version === 3 ? 144000 : 72000) * bitrate / sampleRate) + ((rate >> 1) & 1);
    if (offset > bytes.length) return false;
  }
  return true;
}
