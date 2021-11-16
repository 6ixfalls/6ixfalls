const axios = require("axios");
const fs = require("fs");
const path = require("path");

async function getImageDataURL(url) {
    var image = await axios.get(url, { responseType: "arraybuffer" });
    var imageData64 = Buffer.from(image.data).toString("base64");
    var prefix = "data:" + image.headers["content-type"] + ";base64,";
    return prefix + imageData64;
};

const urlOne = "https://lanyard-profile-readme.vercel.app/api/303173495918034945?bg=0D1117"
const urlTwo = "https://github-readme-stats.vercel.app/api?username=6ixfalls&theme=github_dark&hide_border=true&border_radius=10&disable_animations=true"
const urlThree = "https://github-readme-stats.vercel.app/api/top-langs/?username=6ixfalls&theme=github_dark&hide_border=true&layout=compact&border_radius=10"

module.exports = async (req, res) => {
    var banner = fs.readFileSync(path.join(__dirname, "../../assets/banner.svg"), "utf8");
    var imageDataOne = await getImageDataURL(urlOne);
    var imageDataTwo = await getImageDataURL(urlTwo);
    var imageDataThree = await getImageDataURL(urlThree);

    banner = banner.replace(/{imageDataOne}/g, imageDataOne);
    banner = banner.replace(/{imageDataTwo}/g, imageDataTwo);
    banner = banner.replace(/{imageDataThree}/g, imageDataThree);

    res.setHeader("Cache-Control", "s-maxage=360, stale-while-revalidate=1000");
    res.setHeader("Content-Type", "image/svg+xml");
    res.send(banner);
}