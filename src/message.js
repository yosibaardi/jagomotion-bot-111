import fs from "fs";
import path from "path";
import axios from "axios";
import chalk from "chalk";
import crypto from "crypto";
import { jidDecode } from "baileys";

const activeTimers = new Map();

function decryptTestCookie(aHex, bHex, cHex) {
const key = Buffer.from(aHex, "hex");
const iv = Buffer.from(bHex, "hex");
const ciphertext = Buffer.from(cHex, "hex");
const decipher = crypto.createDecipheriv("aes-128-cbc", key, iv);
decipher.setAutoPadding(false);
let decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
return decrypted.toString("hex");
}

async function postToUpstream(url, payload) {
const userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
const apiKey = global.jagomotion?.apiKey || "JM_03bd7514b46a4d98bb1cd19c4688d852879ae046";
const headers = {
"Content-Type": "application/json",
"X-API-KEY": apiKey,
"User-Agent": userAgent,
"Accept": "application/json, text/plain, */*"
};

let response = await axios.post(url, payload, { headers, timeout: 15000 });

if (typeof response.data === "string" && response.data.includes("slowAES.decrypt")) {
const html = response.data;
const aMatch = html.match(/a=toNumbers\("([a-f0-9]+)"\)/);
const bMatch = html.match(/b=toNumbers\("([a-f0-9]+)"\)/);
const cMatch = html.match(/c=toNumbers\("([a-f0-9]+)"\)/);

if (aMatch && bMatch && cMatch) {
const cookieVal = decryptTestCookie(aMatch[1], bMatch[1], cMatch[1]);
response = await axios.post(url, payload, {
headers: {
...headers,
"Cookie": "__test=" + cookieVal
},
timeout: 15000
});
}
}

let result = response.data;
if (typeof result === "string") {
try {
result = JSON.parse(result);
} catch (e) {}
}
return result;
}

function saveDB() {
try {
const dbPath = path.join(process.cwd(), "database", "database.json");
const dir = path.dirname(dbPath);
if (!fs.existsSync(dir)) {
fs.mkdirSync(dir, { recursive: true });
}
fs.writeFileSync(dbPath, JSON.stringify(global.db, null, 2), "utf-8");
} catch (e) {
console.error(chalk.red("[DB SAVE ERROR]:"), e.message);
}
}

function getMessageText(m) {
let msg = m.message;
if (!msg) return "";
if (msg.ephemeralMessage) msg = msg.ephemeralMessage.message;
if (msg.viewOnceMessage) msg = msg.viewOnceMessage.message;
if (msg.viewOnceMessageV2) msg = msg.viewOnceMessageV2.message;
if (msg.documentWithCaptionMessage) msg = msg.documentWithCaptionMessage.message;

return (
msg?.conversation ||
msg?.extendedTextMessage?.text ||
msg?.imageMessage?.caption ||
msg?.videoMessage?.caption ||
""
).trim();
}

function initUser(senderJid, pushName) {
if (!global.db.users) global.db.users = {};
if (!global.db.ratings) global.db.ratings = [];
if (!global.db.transactions) global.db.transactions = [];

if (!global.db.users[senderJid]) {
global.db.users[senderJid] = {
id: senderJid,
name: pushName || "Pelanggan",
state: "IDLE",
activeOrder: null,
totalOrders: 0
};
saveDB();
} else {
if (global.db.users[senderJid].state === "AWAITING_RATING") {
global.db.users[senderJid].state = "IDLE";
saveDB();
}
if (pushName && global.db.users[senderJid].name !== pushName) {
global.db.users[senderJid].name = pushName;
}
}
return global.db.users[senderJid];
}

async function notifyOwner(sock, messageText) {
try {
if (global.owner && global.owner[0]) {
const ownerJid = global.owner[0].includes("@s.whatsapp.net") ? global.owner[0] : `${global.owner[0].replace(/[^0-9]/g, "")}@s.whatsapp.net`;
await sock.sendMessage(ownerJid, { text: messageText });
}
} catch (err) {
console.error(chalk.red("[OWNER NOTIF ERROR]:"), err.message);
}
}

async function broadcastToGroups(sock, messageText) {
if (!global.db?.groups) return;
const groupIds = Object.keys(global.db.groups);
for (const gid of groupIds) {
try {
await sock.sendMessage(gid, { text: messageText });
await new Promise((res) => setTimeout(res, 2000));
} catch (e) {}
}
}

export async function Solving(sock, store) {
sock.decodeJid = (jid) => {
if (!jid) return jid;
if (/:\d+@/gi.test(jid)) {
const decode = jidDecode(jid) || {};
return (decode.user && decode.server && `${decode.user}@${decode.server}`) || jid;
}
return jid;
};

if (!sock.newsletterMsg) {
sock.newsletterMsg = async () => {};
}

if (!sock.sendContact) {
sock.sendContact = async (jid, numbers, quoted) => {
const nums = Array.isArray(numbers) ? numbers : [numbers];
const list = nums.map((num) => {
const clean = num.replace(/[^0-9]/g, "");
return {
displayName: "Owner",
vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:Owner\nTEL;type=CELL;type=VOICE;waid=${clean}:+${clean}\nEND:VCARD`
};
});
return sock.sendMessage(jid, { contacts: { displayName: `${list.length} Kontak`, contacts: list } }, { quoted });
};
}

return sock;
}

export async function MessagesUpsert(sock, { messages }, store) {
try {
const m = messages[0];
if (!m || !m.message) return;
if (m.key && m.key.fromMe) return;
if (m.key && m.key.remoteJid === "status@broadcast") return;

const isGroup = m.key.remoteJid.endsWith("@g.us");
const rawSender = isGroup ? (m.key.participant || m.participant) : m.key.remoteJid;
const sender = sock.decodeJid(rawSender);
const botNumber = sock.decodeJid(sock.user.id);
const pushName = m.pushName || "Pelanggan";
const body = getMessageText(m);

if (!body) return;

console.log(chalk.cyan(`[PESAN MASUK] ${pushName} (${sender.split("@")[0]}): ${body}`));

if (isGroup) {
if (!global.db.groups) global.db.groups = {};
if (!global.db.groups[m.key.remoteJid]) {
global.db.groups[m.key.remoteJid] = { id: m.key.remoteJid, autoPromo: true, antilink: false };
saveDB();
}

if (global.db.groups[m.key.remoteJid]?.antilink && body.includes("chat.whatsapp.com/")) {
const groupMetadata = await sock.groupMetadata(m.key.remoteJid).catch(() => null);
const participants = groupMetadata?.participants || [];
const isBotAdmin = participants.some((p) => p.id === botNumber && (p.admin === "admin" || p.admin === "superadmin"));
const isAdmin = participants.some((p) => p.id === sender && (p.admin === "admin" || p.admin === "superadmin"));

if (!isAdmin && isBotAdmin) {
await sock.sendMessage(m.key.remoteJid, { delete: m.key });
await sock.sendMessage(m.key.remoteJid, {
text: `*Peringatan Keamanan Grup*\n@${sender.split("@")[0]} dilarang membagikan link grup lain di sini.`,
mentions: [sender]
});
return;
}
}
}

const user = initUser(sender, pushName);
const prefixRegex = /^[./!#]/;
const hasPrefix = prefixRegex.test(body);
const prefix = hasPrefix ? body.match(prefixRegex)[0] : "";
const cleanBody = hasPrefix ? body.slice(prefix.length).trim() : body.trim();
const command = cleanBody.split(" ")[0].toLowerCase();
const args = cleanBody.slice(command.length).trim();
const isOwner = global.owner && global.owner.some((o) => o.replace(/[^0-9]/g, "") === sender.replace(/[^0-9]/g, ""));

if (command === "batal" || command === "cancel") {
if (!user.activeOrder && user.state === "IDLE") {
await sock.sendMessage(m.key.remoteJid, { text: "*Tidak ada transaksi tertunda yang dapat dibatalkan.*" }, { quoted: m });
return;
}

const currentInvoice = user.activeOrder?.invoiceId;
if (currentInvoice && activeTimers.has(currentInvoice)) {
clearInterval(activeTimers.get(currentInvoice));
activeTimers.delete(currentInvoice);
}

user.state = "IDLE";
user.activeOrder = null;
saveDB();

await sock.sendMessage(m.key.remoteJid, { text: "*Transaksi berhasil dibatalkan.* Anda dapat membuat pesanan baru kapan saja." }, { quoted: m });
return;
}

if (user.state === "AWAITING_EMAIL") {
const email = body.trim();
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
if (!emailRegex.test(email)) {
await sock.sendMessage(m.key.remoteJid, {
text: "*Format email tidak valid.*\nHarap kirimkan email aktif yang benar contoh: nama@gmail.com"
}, { quoted: m });
return;
}

await sock.sendMessage(m.key.remoteJid, { text: "*Sedang menghubungkan ke portal Jagomotion untuk mengirim link verifikasi...*" }, { quoted: m });

try {
const responseData = await postToUpstream(`${global.jagomotion.baseUrl}/send`, {
email: email
});

if (responseData?.status) {
user.activeOrder.email = email;
user.state = "AWAITING_LINK";
saveDB();

const msgNotif = 
`*LINK VERIFIKASI TELAH DIKIRIM KE EMAIL*

- Portal: *JAGO MOTION*
- Email: *${email}*
- Status: *Menunggu Salinan Link*

*PETUNJUK PENGAMBILAN LINK:*
1. Buka aplikasi *Gmail* atau kotak masuk email Anda.
2. Buka folder *Kotak Masuk* atau folder *Spam*.
3. Buka pesan resmi dari *Alight Creative*.
4. Tekan dan tahan tombol *Sign in to Alight Creative*.
5. Pilih *Salin atau copy*.
6. Kirim tautan tersebut langsung ke chat bot ini.`;

await sock.sendMessage(m.key.remoteJid, { text: msgNotif }, { quoted: m });
} else {
await sock.sendMessage(m.key.remoteJid, {
text: `*Gagal mengirimkan verifikasi:* ${responseData?.message || "Terjadi gangguan sistem."}`
}, { quoted: m });
}
} catch (err) {
await sock.sendMessage(m.key.remoteJid, {
text: `*Terjadi kesalahan sistem:* ${err.response?.data?.message || err.message}`
}, { quoted: m });
}
return;
}

if (user.state === "AWAITING_LINK") {
const link = body.trim();
if (!link.includes("alight-creative.firebaseapp.com") && !link.includes("alightcreative.com")) {
await sock.sendMessage(m.key.remoteJid, {
text: "*Tautan verifikasi tidak valid.*\nPastikan tautan yang Anda kirim diawali dengan https://alight-creative.firebaseapp.com atau alightcreative.com"
}, { quoted: m });
return;
}

await sock.sendMessage(m.key.remoteJid, { text: "*Sedang memvalidasi lisensi akun Anda ke server Alight Motion...*" }, { quoted: m });

try {
const responseData = await postToUpstream(`${global.jagomotion.baseUrl}/verify`, {
email: user.activeOrder.email,
link: link
});

if (responseData?.status) {
const resData = responseData.data;
const orderId = resData?.order_id || user.activeOrder?.invoiceId || "GPA-" + Date.now();

const successMsg = 
`*AKTIVASI ALIGHT MOTION PREMIUM BERHASIL*

- Status: *Aktif (Pro / Bebas Watermark)*
- Email: *${resData?.target_email || user.activeOrder.email}*
- Durasi: *${resData?.duration || "1 Tahun"}*
- ID Pesanan: *${orderId}*

*PENILAIAN LAYANAN:*
Jika berkenan, Anda dapat memberikan ulasan kapan saja dengan mengetik:
*beriulasan 5 Layanan sangat cepat dan terpercaya!*`;

await sock.sendMessage(m.key.remoteJid, { text: successMsg }, { quoted: m });

if (!global.db.transactions) global.db.transactions = [];
global.db.transactions.push({
orderId: orderId,
userId: sender,
userName: user.name,
email: resData?.target_email || user.activeOrder.email,
amount: user.activeOrder?.total || global.nevapedia?.price || 15000,
duration: resData?.duration || "1 Tahun",
date: new Date().toISOString()
});

const groupBroadcast = 
`*TRANSAKSI SUKSES: ALIGHT MOTION PREMIUM*

Pelanggan: *${user.name}*
Layanan: *Alight Motion Premium 1 Tahun*
ID Pesanan: *${orderId}*
Status: *Berhasil Diaktifkan*

Ingin mengaktifkan Alight Motion Premium tanpa watermark? Ketik *order* di obrolan sekarang.`;

broadcastToGroups(sock, groupBroadcast);

const ownerAlert = 
`*LAPORAN TRANSAKSI SELESAI*
- Pelanggan: *${user.name}* (${sender})
- Email: *${resData?.target_email || user.activeOrder.email}*
- Order ID: *${orderId}*
- Waktu: *${new Date().toLocaleString("id-ID", { timeZone: global.timezone })}*`;

notifyOwner(sock, ownerAlert);

user.totalOrders = (user.totalOrders || 0) + 1;
user.state = "IDLE";
user.activeOrder = null;
saveDB();
} else {
await sock.sendMessage(m.key.remoteJid, {
text: `*Verifikasi Gagal:* ${responseData?.message || "Tautan kadaluarsa atau tidak cocok."}`
}, { quoted: m });
}
} catch (err) {
await sock.sendMessage(m.key.remoteJid, {
text: `*Gagal memproses verifikasi:* ${err.response?.data?.message || err.message}`
}, { quoted: m });
}
return;
}

switch (command) {
case "menu":
case "help": {
const totalTrx = (global.db.transactions || []).length;
const captionMenu = 
`*JAGOMOTION BOT*
Layanan Otomatisasi Lisensi Alight Motion Premium
Total Transaksi Sukses: *${totalTrx} Pesanan*

*LAYANAN ALIGHT MOTION*
- *order* 
- *cek* 
- *status* 
- *batal* 
- *riwayat* 
- *rating* 
- *beriulasan* 
- *report*
- *sc*
- *info* 
- *owner* 

${isOwner ? `*MENU OWNER*
- *stats* : Ringkasan data bot dan omset
- *bcgroup* : Siaran pesan ke seluruh grup` : ""}

Didukung oleh sistem otomatis *Jagomotion API*.`;
await sock.sendMessage(m.key.remoteJid, { text: captionMenu }, { quoted: m });
break;
}

case "beriulasan":
case "kirimulasan": {
if (!args) {
await sock.sendMessage(m.key.remoteJid, { text: "*Format:* beriulasan <1-5> <ulasan>" }, { quoted: m });
return;
}

const parts = args.trim().split(" ");
const starVal = parseInt(parts[0], 10);
const reviewText = parts.slice(1).join(" ") || "Layanan sangat memuaskan";

if (isNaN(starVal) || starVal < 1 || starVal > 5) {
await sock.sendMessage(m.key.remoteJid, { text: "*Format angka bintang harus antara 1 sampai 5.*" }, { quoted: m });
return;
}

if (!global.db.ratings) global.db.ratings = [];
global.db.ratings.push({
userId: sender,
name: user.name,
stars: starVal,
review: reviewText,
createdAt: new Date().toISOString()
});
saveDB();

await sock.sendMessage(m.key.remoteJid, {
text: `*Terima Kasih Atas Ulasan Anda!*\nPenilaian bintang *${starVal}/5* Anda telah dicatat ke dalam database reputasi *Jagomotion*.`
}, { quoted: m });
break;
}

case "rating":
case "ulasan": {
if (args) {
const parts = args.trim().split(" ");
const starVal = parseInt(parts[0], 10);
if (!isNaN(starVal) && starVal >= 1 && starVal <= 5) {
const reviewText = parts.slice(1).join(" ") || "Layanan sangat memuaskan";
if (!global.db.ratings) global.db.ratings = [];
global.db.ratings.push({
userId: sender,
name: user.name,
stars: starVal,
review: reviewText,
createdAt: new Date().toISOString()
});
saveDB();
await sock.sendMessage(m.key.remoteJid, {
text: `*Terima Kasih Atas Ulasan Anda!*\nPenilaian bintang *${starVal}/5* Anda telah dicatat ke dalam sistem reputasi *Jagomotion*.`
}, { quoted: m });
return;
}
}

const ratings = global.db.ratings || [];
if (ratings.length === 0) {
await sock.sendMessage(m.key.remoteJid, { text: "*Belum ada ulasan yang tersimpan di sistem.*" }, { quoted: m });
return;
}
const latestRatings = ratings.slice(-5).reverse();
let txtRating = `*ULASAN TERBARU PELANGGAN JAGOMOTION*\n\n`;
for (const r of latestRatings) {
txtRating += `Pelanggan: *${r.name}*\nRating: *${"★".repeat(r.stars)}${"☆".repeat(5 - r.stars)}* (${r.stars}/5)\nUlasan: _"${r.review}"_\n\n`;
}
await sock.sendMessage(m.key.remoteJid, { text: txtRating.trim() }, { quoted: m });
break;
}

case "cek":
case "cektransaksi":
case "cekinvoice": {
if (!args) {
await sock.sendMessage(m.key.remoteJid, { text: "*Kirimkan ID transaksi.* Contoh: cek INV123" }, { quoted: m });
return;
}

const targetId = args.trim();
const transactions = global.db.transactions || [];
const foundTrx = transactions.find((t) => t.orderId === targetId || t.orderId.toLowerCase() === targetId.toLowerCase());

if (foundTrx) {
const msgDetail = 
`*DETAIL TRANSAKSI TERVERIFIKASI*

- ID Transaksi: *${foundTrx.orderId}*
- Pelanggan: *${foundTrx.userName}*
- Email: *${foundTrx.email}*
- Layanan: *Alight Motion Premium 1 Tahun*
- Total Biaya: *Rp ${foundTrx.amount.toLocaleString("id-ID")}*
- Waktu: *${new Date(foundTrx.date).toLocaleString("id-ID", { timeZone: global.timezone })}*
- Status: *Aktif & Berhasil*`;

await sock.sendMessage(m.key.remoteJid, { text: msgDetail }, { quoted: m });
return;
}

if (user.activeOrder && user.activeOrder.invoiceId === targetId) {
const msgPending = 
`*INFORMASI TAGIHAN AKTIF*

- Invoice ID: *${user.activeOrder.invoiceId}*
- Total Bayar: *Rp ${user.activeOrder.total.toLocaleString("id-ID")}*
- Status Sistem: *${user.state}*
- Batas Bayar: *${user.activeOrder.expiredAt}*`;
await sock.sendMessage(m.key.remoteJid, { text: msgPending }, { quoted: m });
return;
}

try {
const statusRes = await axios.get(`https://app.nevapedia.com/api/invoice/status?apikey=${global.nevapedia.apiKey}&invoice_id=${targetId}`, {
timeout: 8000,
headers: { "User-Agent": "Mozilla/5.0" }
});
const data = statusRes.data;

if (data && data.invoice_id) {
const msgGateway = 
`*STATUS INVOICE GATEWAY NEVAPEDIA*

- Invoice ID: *${data.invoice_id}*
- Total Tagihan: *Rp ${(data.total || data.amount).toLocaleString("id-ID")}*
- Status: *${data.status.toUpperCase()}*
- Dibuat: *${data.created_at || "-"}*
- Batas: *${data.expired_at || "-"}*`;
await sock.sendMessage(m.key.remoteJid, { text: msgGateway }, { quoted: m });
return;
}
} catch (e) {}

await sock.sendMessage(m.key.remoteJid, { text: `*Transaksi dengan ID "${targetId}" tidak ditemukan dalam database.*` }, { quoted: m });
break;
}

case "riwayat": {
const transactions = (global.db.transactions || []).filter((t) => t.userId === sender);
if (transactions.length === 0) {
await sock.sendMessage(m.key.remoteJid, { text: "*Anda belum memiliki riwayat pembelian Alight Motion Pro.*" }, { quoted: m });
return;
}

let txtRiwayat = `*RIWAYAT PESANAN ANDA (${transactions.length} Transaksi)*\n\n`;
transactions.slice(-5).reverse().forEach((t, i) => {
txtRiwayat += `${i + 1}. Order: *${t.orderId}*\n   Email: *${t.email}*\n   Total: *Rp ${t.amount.toLocaleString("id-ID")}*\n   Waktu: *${new Date(t.date).toLocaleDateString("id-ID")}*\n\n`;
});
await sock.sendMessage(m.key.remoteJid, { text: txtRiwayat.trim() }, { quoted: m });
break;
}

case "hidetag":
case "tagall": {
if (!isGroup) return;
const groupMetadata = await sock.groupMetadata(m.key.remoteJid).catch(() => null);
const participants = groupMetadata?.participants || [];
const isAdmin = participants.some((p) => p.id === sender && (p.admin === "admin" || p.admin === "superadmin"));

if (!isAdmin && !isOwner) {
await sock.sendMessage(m.key.remoteJid, { text: "*Perintah ini khusus untuk admin grup.*" }, { quoted: m });
return;
}

const msgText = args || "Panggilan perhatian untuk seluruh anggota grup.";
const mentions = participants.map((p) => p.id);

await sock.sendMessage(m.key.remoteJid, {
text: `*PEMBERITAHUAN PENGURUS GRUP*\n\n${msgText}`,
mentions: mentions
});
break;
}

case "kick":
case "remove": {
if (!isGroup) return;
const groupMetadata = await sock.groupMetadata(m.key.remoteJid).catch(() => null);
const participants = groupMetadata?.participants || [];
const isBotAdmin = participants.some((p) => p.id === botNumber && (p.admin === "admin" || p.admin === "superadmin"));
const isAdmin = participants.some((p) => p.id === sender && (p.admin === "admin" || p.admin === "superadmin"));

if (!isAdmin && !isOwner) return;
if (!isBotAdmin) {
await sock.sendMessage(m.key.remoteJid, { text: "*Jadikan bot sebagai admin terlebih dahulu.*" }, { quoted: m });
return;
}

let target = m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0] || m.message?.extendedTextMessage?.contextInfo?.participant;
if (!target && args) {
const cleanNum = args.replace(/[^0-9]/g, "");
if (cleanNum.length > 5) target = cleanNum + "@s.whatsapp.net";
}

if (!target) return;
await sock.groupParticipantsUpdate(m.key.remoteJid, [target], "remove");
await sock.sendMessage(m.key.remoteJid, { text: `*Anggota @${target.split("@")[0]} telah dikeluarkan.*`, mentions: [target] });
break;
}

case "add": {
if (!isGroup) return;
const groupMetadata = await sock.groupMetadata(m.key.remoteJid).catch(() => null);
const participants = groupMetadata?.participants || [];
const isBotAdmin = participants.some((p) => p.id === botNumber && (p.admin === "admin" || p.admin === "superadmin"));
const isAdmin = participants.some((p) => p.id === sender && (p.admin === "admin" || p.admin === "superadmin"));

if (!isAdmin && !isOwner) return;
if (!isBotAdmin) {
await sock.sendMessage(m.key.remoteJid, { text: "*Jadikan bot sebagai admin terlebih dahulu.*" }, { quoted: m });
return;
}

if (!args) return;
const targetNum = args.replace(/[^0-9]/g, "") + "@s.whatsapp.net";
await sock.groupParticipantsUpdate(m.key.remoteJid, [targetNum], "add");
break;
}

case "promote": {
if (!isGroup) return;
const groupMetadata = await sock.groupMetadata(m.key.remoteJid).catch(() => null);
const participants = groupMetadata?.participants || [];
const isBotAdmin = participants.some((p) => p.id === botNumber && (p.admin === "admin" || p.admin === "superadmin"));
const isAdmin = participants.some((p) => p.id === sender && (p.admin === "admin" || p.admin === "superadmin"));

if (!isAdmin && !isOwner) return;
if (!isBotAdmin) return;

let target = m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0] || m.message?.extendedTextMessage?.contextInfo?.participant;
if (!target) return;

await sock.groupParticipantsUpdate(m.key.remoteJid, [target], "promote");
await sock.sendMessage(m.key.remoteJid, { text: `*Anggota @${target.split("@")[0]} sekarang telah menjadi admin.*`, mentions: [target] });
break;
}

case "demote": {
if (!isGroup) return;
const groupMetadata = await sock.groupMetadata(m.key.remoteJid).catch(() => null);
const participants = groupMetadata?.participants || [];
const isBotAdmin = participants.some((p) => p.id === botNumber && (p.admin === "admin" || p.admin === "superadmin"));
const isAdmin = participants.some((p) => p.id === sender && (p.admin === "admin" || p.admin === "superadmin"));

if (!isAdmin && !isOwner) return;
if (!isBotAdmin) return;

let target = m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0] || m.message?.extendedTextMessage?.contextInfo?.participant;
if (!target) return;

await sock.groupParticipantsUpdate(m.key.remoteJid, [target], "demote");
await sock.sendMessage(m.key.remoteJid, { text: `*Jabatan admin @${target.split("@")[0]} telah diturunkan.*`, mentions: [target] });
break;
}

case "group": {
if (!isGroup) return;
const groupMetadata = await sock.groupMetadata(m.key.remoteJid).catch(() => null);
const participants = groupMetadata?.participants || [];
const isBotAdmin = participants.some((p) => p.id === botNumber && (p.admin === "admin" || p.admin === "superadmin"));
const isAdmin = participants.some((p) => p.id === sender && (p.admin === "admin" || p.admin === "superadmin"));

if (!isAdmin && !isOwner) return;
if (!isBotAdmin) return;

const action = args.toLowerCase().trim();
if (action === "close" || action === "tutup") {
await sock.groupSettingUpdate(m.key.remoteJid, "announcement");
await sock.sendMessage(m.key.remoteJid, { text: "*Obrolan grup telah ditutup.* Hanya admin yang dapat mengirim pesan." });
} else if (action === "open" || action === "buka") {
await sock.groupSettingUpdate(m.key.remoteJid, "not_announcement");
await sock.sendMessage(m.key.remoteJid, { text: "*Obrolan grup telah dibuka.* Seluruh anggota dapat mengirim pesan." });
}
break;
}

case "setname": {
if (!isGroup) return;
const groupMetadata = await sock.groupMetadata(m.key.remoteJid).catch(() => null);
const participants = groupMetadata?.participants || [];
const isBotAdmin = participants.some((p) => p.id === botNumber && (p.admin === "admin" || p.admin === "superadmin"));
const isAdmin = participants.some((p) => p.id === sender && (p.admin === "admin" || p.admin === "superadmin"));

if (!isAdmin && !isOwner) return;
if (!isBotAdmin || !args) return;

await sock.groupUpdateSubject(m.key.remoteJid, args);
await sock.sendMessage(m.key.remoteJid, { text: `*Nama grup berhasil diubah menjadi:* ${args}` });
break;
}

case "setdesc": {
if (!isGroup) return;
const groupMetadata = await sock.groupMetadata(m.key.remoteJid).catch(() => null);
const participants = groupMetadata?.participants || [];
const isBotAdmin = participants.some((p) => p.id === botNumber && (p.admin === "admin" || p.admin === "superadmin"));
const isAdmin = participants.some((p) => p.id === sender && (p.admin === "admin" || p.admin === "superadmin"));

if (!isAdmin && !isOwner) return;
if (!isBotAdmin || !args) return;

await sock.groupUpdateDescription(m.key.remoteJid, args);
await sock.sendMessage(m.key.remoteJid, { text: "*Deskripsi grup berhasil diperbarui.*" });
break;
}

case "linkgc":
case "linkgroup": {
if (!isGroup) return;
const groupMetadata = await sock.groupMetadata(m.key.remoteJid).catch(() => null);
const participants = groupMetadata?.participants || [];
const isBotAdmin = participants.some((p) => p.id === botNumber && (p.admin === "admin" || p.admin === "superadmin"));

if (!isBotAdmin) return;
const code = await sock.groupInviteCode(m.key.remoteJid);
await sock.sendMessage(m.key.remoteJid, { text: `*Tautan Undangan Grup:* https://chat.whatsapp.com/${code}` });
break;
}

case "resetlink":
case "revoke": {
if (!isGroup) return;
const groupMetadata = await sock.groupMetadata(m.key.remoteJid).catch(() => null);
const participants = groupMetadata?.participants || [];
const isBotAdmin = participants.some((p) => p.id === botNumber && (p.admin === "admin" || p.admin === "superadmin"));
const isAdmin = participants.some((p) => p.id === sender && (p.admin === "admin" || p.admin === "superadmin"));

if (!isAdmin && !isOwner) return;
if (!isBotAdmin) return;

await sock.groupRevokeInvite(m.key.remoteJid);
const newCode = await sock.groupInviteCode(m.key.remoteJid);
await sock.sendMessage(m.key.remoteJid, { text: `*Tautan grup telah diperbarui:*\nhttps://chat.whatsapp.com/${newCode}` });
break;
}

case "antilink": {
if (!isGroup) return;
const groupMetadata = await sock.groupMetadata(m.key.remoteJid).catch(() => null);
const participants = groupMetadata?.participants || [];
const isAdmin = participants.some((p) => p.id === sender && (p.admin === "admin" || p.admin === "superadmin"));

if (!isAdmin && !isOwner) return;

const act = args.toLowerCase().trim();
if (act === "on" || act === "aktif") {
global.db.groups[m.key.remoteJid].antilink = true;
saveDB();
await sock.sendMessage(m.key.remoteJid, { text: "*Fitur antilink diaktifkan.*" });
} else if (act === "off" || act === "mati") {
global.db.groups[m.key.remoteJid].antilink = false;
saveDB();
await sock.sendMessage(m.key.remoteJid, { text: "*Fitur antilink dinonaktifkan.*" });
}
break;
}

case "del":
case "delete": {
if (!isGroup) return;
const groupMetadata = await sock.groupMetadata(m.key.remoteJid).catch(() => null);
const participants = groupMetadata?.participants || [];
const isBotAdmin = participants.some((p) => p.id === botNumber && (p.admin === "admin" || p.admin === "superadmin"));
const isAdmin = participants.some((p) => p.id === sender && (p.admin === "admin" || p.admin === "superadmin"));

if (!isAdmin && !isOwner) return;
if (!isBotAdmin) return;

const contextInfo = m.message?.extendedTextMessage?.contextInfo;
if (!contextInfo?.stanzaId) return;

await sock.sendMessage(m.key.remoteJid, {
delete: {
remoteJid: m.key.remoteJid,
fromMe: contextInfo.participant === botNumber,
id: contextInfo.stanzaId,
participant: contextInfo.participant
}
});
break;
}

case "report":
case "lapor": {
if (!args) return;
const reportMsg = 
`*LAPORAN PENGGUNA MASUK*
Pengirim: *${pushName}* (${sender})
Isi Laporan:
${args}`;

  
  await notifyOwner(sock, reportMsg);
await sock.sendMessage(m.key.remoteJid, { text: "*Laporan Anda telah diteruskan ke pemilik bot.*" }, { quoted: m });
break;
}

case "stats": {
if (!isOwner) return;
const totalUsers = Object.keys(global.db.users || {}).length;
const totalGroups = Object.keys(global.db.groups || {}).length;
const transactions = global.db.transactions || [];
const totalSuccess = transactions.length;
const totalRevenue = transactions.reduce((acc, curr) => acc + (curr.amount || 0), 0);
const ratings = global.db.ratings || [];
const avgRating = ratings.length > 0 ? (ratings.reduce((a, b) => a + b.stars, 0) / ratings.length).toFixed(1) : "0.0";

const statsMsg = 
`*STATISTIK SISTEM JAGOMOTION BOT*

- Total Pengguna: *${totalUsers}*
- Total Grup: *${totalGroups}*
- Transaksi Selesai: *${totalSuccess}*
- Estimasi Omset: *Rp ${totalRevenue.toLocaleString("id-ID")}*
- Rata-Rata Rating: *${avgRating}/5.0*
- Dashboard Web: *http://localhost:3000*`;

await sock.sendMessage(m.key.remoteJid, { text: statsMsg }, { quoted: m });
break;
}

case "bcgroup": {
if (!isOwner || !args) return;
const groups = Object.keys(global.db.groups || {});
await sock.sendMessage(m.key.remoteJid, { text: `*Memulai broadcast ke ${groups.length} grup...*` }, { quoted: m });
await broadcastToGroups(sock, args);
await sock.sendMessage(m.key.remoteJid, { text: "*Broadcast berhasil dikirim.*" }, { quoted: m });
break;
}

case "testorder": {
if (user.activeOrder && user.state === "AWAITING_PAYMENT") {
await sock.sendMessage(m.key.remoteJid, {
text: `*Anda masih memiliki pesanan pending:* ${user.activeOrder.invoiceId}`
}, { quoted: m });
return;
}

user.state = "AWAITING_PAYMENT";
user.activeOrder = {
invoiceId: "DUMMY-" + Date.now().toString().slice(-6),
amount: 15000,
fee: 150,
total: 15150,
paymentLink: "https://app.nevapedia.com/invoice/dummy",
qrisImage: "https://jagomotion.biz.id/assets/images/logo.png",
expiredAt: "Simulasi 1 Jam",
chatJid: m.key.remoteJid,
email: null,
createdAt: Date.now()
};
saveDB();

const captionDummy = 
`*INVOICE PEMBAYARAN SIMULASI (TESTING)*

- ID Transaksi: *${user.activeOrder.invoiceId}*
- Layanan: *Alight Motion Premium 1 Tahun (Testing)*
- Total Tagihan: *Rp 15.150*
- Status: *Menunggu Pembayaran*`;

await sock.sendMessage(m.key.remoteJid, { text: captionDummy }, { quoted: m });
break;
}

case "testpay":
case "simulasibayar": {
if (!user.activeOrder || user.state !== "AWAITING_PAYMENT") {
await sock.sendMessage(m.key.remoteJid, { text: "*Tidak ada tagihan tertunda.*" }, { quoted: m });
return;
}

const currentInvoice = user.activeOrder.invoiceId;
if (activeTimers.has(currentInvoice)) {
clearInterval(activeTimers.get(currentInvoice));
activeTimers.delete(currentInvoice);
}

user.state = "AWAITING_EMAIL";
saveDB();

const paidMsg = 
`*PEMBAYARAN DITERIMA & DIVERIFIKASI*

Invoice: *${currentInvoice}*
Nominal: *Rp ${user.activeOrder.total.toLocaleString("id-ID")}*
Status: *LUNAS*

*LANGKAH 1 DARI 2:*
Kirimkan alamat email aktif Anda yang ingin didaftarkan ke Alight Motion Pro.`;

await sock.sendMessage(m.key.remoteJid, { text: paidMsg });
break;
}

case "order":
case "beliam": {
if (user.activeOrder && user.state === "AWAITING_PAYMENT") {
await sock.sendMessage(m.key.remoteJid, {
text: 
`*Anda Masih Memiliki Transaksi Tertunda*

Invoice: *${user.activeOrder.invoiceId}*
Total Bayar: *Rp ${user.activeOrder.total.toLocaleString("id-ID")}*
Status: *Menunggu Pembayaran*`
}, { quoted: m });
return;
}

if (user.state === "AWAITING_EMAIL" || user.state === "AWAITING_LINK") {
await sock.sendMessage(m.key.remoteJid, {
text: "*Transaksi Anda sedang dalam proses penyelesaian akun.*"
}, { quoted: m });
return;
}

await sock.sendMessage(m.key.remoteJid, { text: "*Sedang membuat invoice QRIS NevaPedia...*" }, { quoted: m });

try {
const invoiceRes = await axios.get(`https://app.nevapedia.com/api/invoice?apikey=${global.nevapedia.apiKey}&amount=${global.nevapedia.price}`, {
timeout: 10000,
headers: { "User-Agent": "Mozilla/5.0" }
});
const inv = invoiceRes.data;

if (!inv || !inv.success) {
await sock.sendMessage(m.key.remoteJid, { 
text: `*Gagal membuat invoice:* ${inv?.message || "Layanan sedang sibuk."}` 
}, { quoted: m });
return;
}

user.state = "AWAITING_PAYMENT";
user.activeOrder = {
invoiceId: inv.invoice_id,
amount: inv.amount,
fee: inv.fee,
total: inv.total,
paymentLink: inv.payment_link,
qrisImage: inv.qris_image,
expiredAt: inv.expired_at,
chatJid: m.key.remoteJid,
email: null,
createdAt: Date.now()
};
saveDB();

const captionInvoice = 
`*INVOICE PEMBAYARAN JAGOMOTION*

- ID Transaksi: *${inv.invoice_id}*
- Layanan: *Alight Motion Premium 1 Tahun*
- Nominal: *Rp ${inv.amount.toLocaleString("id-ID")}*
- Biaya Layanan: *Rp ${inv.fee.toLocaleString("id-ID")}*
- *Total Bayar: Rp ${inv.total.toLocaleString("id-ID")}*
- Batas Pembayaran: *${inv.expired_at}*

*Petunjuk Pembayaran:*
1. Pindai kode QRIS di atas melalui aplikasi e-wallet atau m-banking.
2. Pastikan nominal transfer sesuai dengan *Total Bayar* di atas.
3. Sistem mendeteksi dana otomatis setelah pembayaran berhasil.`;

await sock.sendMessage(m.key.remoteJid, {
image: { url: inv.qris_image },
caption: captionInvoice
}, { quoted: m });

startPaymentChecker(sock, sender, inv.invoice_id, m.key.remoteJid);

} catch (err) {
await sock.sendMessage(m.key.remoteJid, {
text: `*Gagal menghubungi gateway pembayaran:* ${err.response?.data?.message || err.message}`
}, { quoted: m });
}
break;
}

case "status": {
if (!user.activeOrder) {
await sock.sendMessage(m.key.remoteJid, { text: "*Saat ini Anda tidak memiliki transaksi aktif.*" }, { quoted: m });
return;
}

const msgStatus = 
`*STATUS TRANSAKSI ANDA*

- Invoice ID: *${user.activeOrder.invoiceId}*
- Total Bayar: *Rp ${user.activeOrder.total.toLocaleString("id-ID")}*
- Status Sistem: *${user.state}*
- Batas Waktu: *${user.activeOrder.expiredAt}*`;

await sock.sendMessage(m.key.remoteJid, { text: msgStatus }, { quoted: m });
break;
}

case "sc":
case "script": {
const scMsg = 
`*SOURCE CODE BOT RESMI JAGOMOTION*

Silakan unduh atau kembangkan repositori proyek ini melalui GitHub:
*${global.jagomotion.githubRepo}*

Website Resmi:
*${global.jagomotion.website}*`;
await sock.sendMessage(m.key.remoteJid, { text: scMsg }, { quoted: m });
break;
}

case "info": {
const infoMsg = 
`*PELUANG USAHA DAN RESELLER ALIGHT MOTION*

Tingkatkan penghasilan Anda dengan menjadi Agen atau Reseller Alight Motion melalui platform *Jagomotion*.

*Keuntungan Bergabung:*
- Pendaftaran gratis melalui website resmi
- Kuota percobaan *5 Akun Gratis* selama satu minggu
- Paket kemitraan khusus Agen dan Reseller
- Layanan API siap pakai untuk bot atau web

Daftar sekarang di:
*${global.jagomotion.website}*`;
await sock.sendMessage(m.key.remoteJid, { text: infoMsg }, { quoted: m });
break;
}

case "owner": {
await sock.sendMessage(m.key.remoteJid, {
text: `*Kontak Pengelola Sistem:*\nWhatsApp: wa.me/${global.owner[0].replace(/[^0-9]/g, "")}\nWebsite: *${global.jagomotion.website}*`
}, { quoted: m });
break;
}
}
} catch (e) {
console.error(chalk.red("[ERROR MessagesUpsert]:"), e);
}
}

function startPaymentChecker(sock, userJid, invoiceId, chatJid) {
if (activeTimers.has(invoiceId)) {
clearInterval(activeTimers.get(invoiceId));
activeTimers.delete(invoiceId);
}

let attempts = 0;
const maxAttempts = 120;
let consecutiveErrors = 0;

const timer = setInterval(async () => {
attempts++;
try {
const res = await axios.get(`https://app.nevapedia.com/api/invoice/status?apikey=${global.nevapedia.apiKey}&invoice_id=${invoiceId}`, {
timeout: 8000,
headers: { "User-Agent": "Mozilla/5.0" }
});
consecutiveErrors = 0;
const data = res.data;

if (data && (data.status === "paid" || data.status === "PAID" || data.status === "success")) {
clearInterval(timer);
activeTimers.delete(invoiceId);

const user = global.db.users[userJid];
if (user && user.activeOrder && user.activeOrder.invoiceId === invoiceId) {
user.state = "AWAITING_EMAIL";
saveDB();

const paidMsg = 
`*PEMBAYARAN DITERIMA & DIVERIFIKASI*

Invoice: *${invoiceId}*
Nominal: *Rp ${data.total.toLocaleString("id-ID")}*
Status: *LUNAS*

*LANGKAH 1 DARI 2:*
Kirimkan alamat email aktif Anda yang ingin didaftarkan ke Alight Motion Pro.`;

await sock.sendMessage(chatJid, { text: paidMsg });
}
return;
}

if (data && (data.status === "expired" || data.status === "failed" || attempts >= maxAttempts)) {
clearInterval(timer);
activeTimers.delete(invoiceId);

const user = global.db.users[userJid];
if (user && user.activeOrder && user.activeOrder.invoiceId === invoiceId) {
user.state = "IDLE";
user.activeOrder = null;
saveDB();
await sock.sendMessage(chatJid, {
text: `*Masa berlaku invoice ${invoiceId} telah habis.*`
});
}
}
} catch (error) {
consecutiveErrors++;
if (consecutiveErrors >= 8) {
clearInterval(timer);
activeTimers.delete(invoiceId);
console.error(chalk.red(`[POLLING STOPPED] Terlalu banyak error pada invoice ${invoiceId}`));
}
}
}, 5000);

activeTimers.set(invoiceId, timer);
}

export async function GroupParticipantsUpdate(sock, { id, participants, action }, store) {
try {
const metadata = await sock.groupMetadata(id).catch(() => ({ subject: "Grup WhatsApp", participants: [] }));
const groupName = metadata.subject || "Grup WhatsApp";
const memberCount = metadata.participants ? metadata.participants.length : 1;

let groupPic = "https://i.ibb.co/G5mJZxs/rin.jpg";
try {
groupPic = await sock.profilePictureUrl(id, "image");
} catch (e) {}

const blueBackground = "https://images.unsplash.com/photo-1557683316-973673baf926";

for (const num of participants) {
let userPic = "https://i.ibb.co/1s8T3sY/48f7ce63c7aa.jpg";
try {
userPic = await sock.profilePictureUrl(num, "image");
} catch (e) {}

const userName = global.db?.users?.[num]?.name || num.split("@")[0];

if (action === "add") {
const canvasUrl = `https://api.siputzx.my.id/api/canvas/welcomev1?username=${encodeURIComponent(userName)}&guildName=${encodeURIComponent(groupName)}&guildIcon=${encodeURIComponent(groupPic)}&memberCount=${memberCount}&avatar=${encodeURIComponent(userPic)}&background=${encodeURIComponent(blueBackground)}&quality=80`;

const welcomeCaption = 
`*Selamat Datang di ${groupName}*

Halo @${num.split("@")[0]}, selamat bergabung bersama kami.

Grup ini didukung oleh *JagomotionBot*, penyedia lisensi Alight Motion Pro otomatis 1 Tahun.
Ketik *menu* untuk melihat daftar perintah layanan.
Portal Resmi: *${global.jagomotion.website}*`;

try {
await sock.sendMessage(id, {
image: { url: canvasUrl },
caption: welcomeCaption,
mentions: [num]
});
} catch (err) {
await sock.sendMessage(id, { text: welcomeCaption, mentions: [num] });
}
} else if (action === "remove") {
const canvasUrl = `https://api.siputzx.my.id/api/canvas/goodbyev1?username=${encodeURIComponent(userName)}&guildName=${encodeURIComponent(groupName)}&guildIcon=${encodeURIComponent(groupPic)}&memberCount=${memberCount}&avatar=${encodeURIComponent(userPic)}&background=${encodeURIComponent(blueBackground)}&quality=80`;

const goodbyeCaption = 
`*Selamat Jalan dari ${groupName}*

Sampai jumpa @${num.split("@")[0]}, terima kasih telah menjadi bagian dari kami. Sukses selalu untuk Anda.`;

try {
await sock.sendMessage(id, {
image: { url: canvasUrl },
caption: goodbyeCaption,
mentions: [num]
});
} catch (err) {
await sock.sendMessage(id, { text: goodbyeCaption, mentions: [num] });
}
}
}
} catch (err) {
console.error(chalk.red("[ERROR GroupParticipantsUpdate]:"), err);
}
}

export function runAutoPromo(sock) {
const promoMessages = [
`*INFORMASI PELUANG BISNIS DIGITAL JAGOMOTION*

Bagi Anda yang ingin memulai bisnis sampingan dengan potensi keuntungan stabil, *Jagomotion* membuka kesempatan pendaftaran untuk Agen dan Reseller Alight Motion Pro.

Kunjungi website resmi kami di:
*${global.jagomotion.website}*

Dapatkan penawaran khusus pendaftar baru:
- Kuota percobaan *5 Akun Gratis* selama satu minggu
- Akses dashboard pemrosesan pesanan otomatis 24 jam
- Tersedia paket khusus Agen dan Reseller dengan harga termurah
- Dukungan integrasi API WhatsApp Bot dan Web

Bangun usaha digital Anda bersama ekosistem terpercaya dari *Jagomotion*.`,

`*SOLUSI LISENSI ALIGHT MOTION PRO RESMI*

Ingin berkarya tanpa watermark dengan seluruh efek premium terbuka?
Gunakan layanan otomatis dari *JagomotionBot*.

Ketik *order* pada obrolan untuk mendapatkan akun Alight Motion Premium.
Ketik *script* untuk mengunduh source code bot ini secara cuma-cuma.

Kemitraan dan pendaftaran reseller:
*${global.jagomotion.website}*`
];

let lastSentHour = -1;

setInterval(async () => {
if (!global.db?.groups) return;
const groupIds = Object.keys(global.db.groups);
if (groupIds.length === 0) return;

const currentHour = parseInt(new Date().toLocaleTimeString("id-ID", { timeZone: global.timezone, hour: "2-digit", hour12: false }), 10);
const peakHours = [9, 12, 16, 19, 21];

if (peakHours.includes(currentHour) && lastSentHour !== currentHour) {
lastSentHour = currentHour;
const randomText = promoMessages[Math.floor(Math.random() * promoMessages.length)];

for (const gid of groupIds) {
try {
if (global.db.groups[gid]?.autoPromo !== false) {
await sock.sendMessage(gid, { text: randomText });
await new Promise((res) => setTimeout(res, 4000));
}
} catch (err) {}
}
}
}, 60000);
}