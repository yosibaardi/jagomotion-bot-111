import fs from "fs";
import path from "path";

export function dataBase(filePath, type = "database") {
    const fullPath = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
    const dir = path.dirname(fullPath);

    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    if (!fs.existsSync(fullPath)) {
        fs.writeFileSync(fullPath, JSON.stringify({}, null, 2), "utf-8");
    }

    return {
        read: async () => {
            try {
                const data = fs.readFileSync(fullPath, "utf-8");
                return JSON.parse(data || "{}");
            } catch (e) {
                return {};
            }
        },
        write: async (data) => {
            try {
                fs.writeFileSync(fullPath, JSON.stringify(data, null, 2), "utf-8");
                return true;
            } catch (e) {
                console.error(`[DB Error] Gagal menulis ke ${fullPath}:`, e.message);
                return false;
            }
        }
    };
}

export function cmdDel(hit) {}
export function checkStatus(jid, premiumList = []) {
    return premiumList.includes(jid);
}
export function checkExpired(list) {}