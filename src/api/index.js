const fetch = require("node-fetch");
const fs = require("fs");
const path = require("path");

async function getImageDataURL(url) {
    let blob = await fetch(url).then(r => r.blob());
    return new Promise(resolve => {
        let reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(blob);
    });
};

const urlOne = "https://lanyard-profile-readme.vercel.app/api/303173495918034945?bg=0D1117"
const urlTwo = "https://github-readme-stats.vercel.app/api?username=6ixfalls&amp;theme=github_dark&amp;hide_border=true&amp;border_radius=10"
const urlThree = "https://github-readme-stats.vercel.app/api/top-langs/?username=6ixfalls&amp;theme=github_dark&amp;hide_border=true&amp;layout=compact&amp;border_radius=10"

module.exports = async (req, res) => {
    var banner = fs.readFileSync(path.join(__dirname, "../../assets/banner.svg"), "utf8");
    var imageDataOne = await getImageDataURL(urlOne);
    var imageDataTwo = await getImageDataURL(urlTwo);
    var imageDataThree = await getImageDataURL(urlThree);

    banner.replace("{imageDataOne}", imageDataOne);
    banner.replace("{imageDataTwo}", imageDataTwo);
    banner.replace("{imageDataThree}", imageDataThree);

    res.send(banner);
}