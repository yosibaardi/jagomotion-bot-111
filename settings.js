import fs from "fs";

global.owner = ["6283115944494@s.whatsapp.net"]; //Isi dengan nomor owner
global.number_bot = "6281586772709"; //isi nomor bot, tapi kalo mau isi di terminal kosongin aja
global.pairing_code = true;


global.jagomotion = {
    apiKey: "JM_be0b6ddb0fee24f72068c2c0976b08e17aa377fd", //masukin key jagomotion.biz.id
    baseUrl: "https://jagomotion.biz.id/api/v1/am",
    website: "https://jagomotion.biz.id",
    githubRepo: "https://github.com/jagomotion/jagomotion-bot" //repo github biarin aja
};

global.nevapedia = {
    apiKey: "SKY_98e26be496964d66",  //isi dengan key nevapedia.com sebagai payment gateway
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