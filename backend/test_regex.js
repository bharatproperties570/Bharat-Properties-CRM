const escapeRegExp = (string) => {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};
const val = "+91";
const escaped = escapeRegExp(val);
console.log("Val:", val);
console.log("Escaped:", escaped);
try {
    const re = new RegExp(`^${escaped}$`, 'i');
    console.log("RegExp:", re);
} catch (e) {
    console.error("Error:", e.message);
}
