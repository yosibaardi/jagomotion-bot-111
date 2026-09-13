import fs from "fs";

global.owner = ["6281234567@s.whatsapp.net"]; //Isi dengan nomor owner
global.number_bot = ""; //isi nomor bot, tapi kalo mau isi di terminal kosongin aja
global.pairing_code = true;


global.jagomotion = {
    apiKey: "", //masukin key jagomotion.biz.id
    baseUrl: "https://jagomotion.biz.id/api/v1/am",
    website: "https://jagomotion.biz.id",
    githubRepo: "https://github.com/jagomotion/jagomotion-bot" //repo github biarin aja
};

global.nevapedia = {
    apiKey: "",  //isi dengan key nevapedia.com sebagai payment gateway
    price: 2500 
};

global.database = {
    path: "database",
    options: {
        database: "database.json",
        store: "baileys_store.json"
    }
};

global.timezone = "Asia/Jakarta";
global.jadwalSholat = {
    Subuh: "04:35",
    Dzuhur: "11:55",
    Ashar: "15:10",
    Maghrib: "18:00",
    Isya: "19:10"
};

global.APIs = {};
global.APIKeys = {};
global.my = { ch: "" };
global.limit = { free: 50, premium: 1000, vip: 9999 };