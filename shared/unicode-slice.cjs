// Keep UTF-16 offsets/cursors stable while never handing half an emoji to the
// Python tokenizer. Overlapping memory windows retain the complete character
// in an adjacent window; the full stored source is unchanged.
function unicodeSlice(value, start = 0, end = value.length) {
    const high = n => n >= 0xd800 && n <= 0xdbff;
    const low = n => n >= 0xdc00 && n <= 0xdfff;
    if (start > 0 && low(value.charCodeAt(start)) && high(value.charCodeAt(start - 1))) start++;
    if (end < value.length && high(value.charCodeAt(end - 1)) && low(value.charCodeAt(end))) end--;
    return value.slice(start, Math.max(start, end));
}
module.exports = { unicodeSlice };
