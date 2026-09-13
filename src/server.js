import http from "http";
import chalk from "chalk";

export async function setupDashboard(database, storeDB, sock) {
    const PORT = process.env.PORT || 3000;

    const server = http.createServer((req, res) => {
        if (req.url === "/api/data") {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify(global.db || {}));
            return;
        }

        const totalUsers = Object.keys(global.db?.users || {}).length;
        const totalGroups = Object.keys(global.db?.groups || {}).length;
        const transactions = global.db?.transactions || [];
        const totalRevenue = transactions.reduce((acc, curr) => acc + (curr.amount || 0), 0);
        const ratings = global.db?.ratings || [];
        const avgRating = ratings.length > 0 ? (ratings.reduce((a, b) => a + b.stars, 0) / ratings.length).toFixed(1) : "0.0";
        const botNumber = sock?.user?.id ? sock.decodeJid(sock.user.id) : "Terhubung";

        const recentTrxRows = transactions.slice(-10).reverse().map((t) => `
            <tr>
                <td><strong>${t.orderId}</strong></td>
                <td>${t.userName || "Pelanggan"}</td>
                <td>${t.email || "-"}</td>
                <td>Rp ${(t.amount || 0).toLocaleString("id-ID")}</td>
                <td><span class="badge badge-success">Selesai</span></td>
                <td>${new Date(t.date).toLocaleString("id-ID")}</td>
            </tr>
        `).join("") || `<tr><td colspan="6" style="text-align:center;color:#64748b;">Belum ada riwayat transaksi</td></tr>`;

        const recentRatingRows = ratings.slice(-5).reverse().map((r) => `
            <div class="review-card">
                <div class="review-header">
                    <strong>${r.name}</strong>
                    <span class="stars">${"★".repeat(r.stars)}${"☆".repeat(5 - r.stars)}</span>
                </div>
                <p class="review-body">"${r.review}"</p>
                <small class="review-date">${new Date(r.createdAt).toLocaleString("id-ID")}</small>
            </div>
        `).join("") || `<p style="color:#64748b;">Belum ada ulasan dari pelanggan.</p>`;

        const html = `
<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Dashboard Monitoring - JagomotionBot</title>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700&display=swap" rel="stylesheet">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; font-family: 'Plus Jakarta Sans', sans-serif; }
        body { background: #0b132b; color: #f8fafc; padding: 30px 20px; }
        .container { max-width: 1200px; margin: 0 auto; }
        header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px; border-bottom: 1px solid #1e293b; padding-bottom: 20px; }
        h1 { font-size: 26px; color: #38bdf8; }
        .bot-status { background: #1e293b; padding: 8px 16px; border-radius: 999px; font-size: 14px; border: 1px solid #334155; }
        .status-dot { display: inline-block; width: 10px; height: 10px; background: #22c55e; border-radius: 50%; margin-right: 6px; }
        .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 20px; margin-bottom: 35px; }
        .card { background: #1c2541; padding: 22px; border-radius: 14px; border: 1px solid #334155; }
        .card h3 { font-size: 13px; color: #94a3b8; text-transform: uppercase; margin-bottom: 8px; letter-spacing: 0.5px; }
        .card .value { font-size: 26px; font-weight: 700; color: #ffffff; }
        .section-title { font-size: 20px; margin-bottom: 16px; color: #38bdf8; display: flex; align-items: center; gap: 8px; }
        .table-responsive { background: #1c2541; border-radius: 14px; border: 1px solid #334155; overflow-x: auto; margin-bottom: 35px; }
        table { width: 100%; border-collapse: collapse; text-align: left; font-size: 14px; }
        th, td { padding: 14px 18px; border-bottom: 1px solid #1e293b; }
        th { background: #111c38; color: #94a3b8; font-weight: 600; text-transform: uppercase; font-size: 12px; }
        tr:hover { background: #222f54; }
        .badge { display: inline-block; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; }
        .badge-success { background: rgba(34, 197, 94, 0.15); color: #4ade80; border: 1px solid rgba(34, 197, 94, 0.3); }
        .reviews-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; margin-bottom: 35px; }
        .review-card { background: #1c2541; border: 1px solid #334155; border-radius: 12px; padding: 18px; }
        .review-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
        .stars { color: #facc15; font-size: 16px; }
        .review-body { font-size: 14px; color: #cbd5e1; font-style: italic; margin-bottom: 10px; }
        .review-date { font-size: 11px; color: #64748b; }
        footer { text-align: center; color: #64748b; font-size: 13px; margin-top: 20px; }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <div>
                <h1>JAGOMOTION MONITORING</h1>
                <p style="color: #94a3b8; font-size: 14px; margin-top: 4px;">Pusat Pemantauan Operasional & Transaksi Otomatis</p>
            </div>
            <div class="bot-status">
                <span class="status-dot"></span> Bot Aktif: <strong>${botNumber}</strong>
            </div>
        </header>

        <div class="stats-grid">
            <div class="card">
                <h3>Total Transaksi</h3>
                <div class="value">${transactions.length} Order</div>
            </div>
            <div class="card">
                <h3>Estimasi Omset</h3>
                <div class="value">Rp ${totalRevenue.toLocaleString("id-ID")}</div>
            </div>
            <div class="card">
                <h3>Total Pengguna</h3>
                <div class="value">${totalUsers} Kontak</div>
            </div>
            <div class="card">
                <h3>Grup Aktif</h3>
                <div class="value">${totalGroups} Grup</div>
            </div>
            <div class="card">
                <h3>Kepuasan Rating</h3>
                <div class="value">${avgRating} / 5.0 ⭐</div>
            </div>
        </div>

        <h2 class="section-title">Riwayat Transaksi Terbaru</h2>
        <div class="table-responsive">
            <table>
                <thead>
                    <tr>
                        <th>Order ID</th>
                        <th>Pelanggan</th>
                        <th>Email Target</th>
                        <th>Nominal</th>
                        <th>Status</th>
                        <th>Tanggal Transaksi</th>
                    </tr>
                </thead>
                <tbody>
                    ${recentTrxRows}
                </tbody>
            </table>
        </div>

        <h2 class="section-title">Ulasan Pelanggan Terakhir</h2>
        <div class="reviews-grid">
            ${recentRatingRows}
        </div>

        <footer>
            Didukung oleh Platform Resmi <strong>Jagomotion.biz.id</strong> & NevaPedia Gateway
        </footer>
    </div>
</body>
</html>
        `;

        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(html);
    });

    server.listen(PORT, () => {
        console.log(chalk.bold.cyan(`[WEB DASHBOARD] Berjalan di http://localhost:${PORT}`));
    });

    return server;
}