import { useMultiFileAuthState } from "baileys";

export async function useCustomAuthState(sessionPath) {
    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    return { state, saveCreds };
}


