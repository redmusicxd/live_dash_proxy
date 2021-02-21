var mkfifo = require('mkfifo').mkfifoSync;
var mpd = require('mpd-parser')
const fs = require('fs');
const {default: axios} = require('axios')
const child = require('child_process')

if(!fs.existsSync('video')){
    mkfifo('video', 0600);
}
if(!fs.existsSync('audio')){
    mkfifo('audio', 0600);
}

var prevVideo = '';
var tempVideo = '';
var prevAudio = '';
var tempAudio = '';

function makeid(length) {
    var result           = '';
    var characters       = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    var charactersLength = characters.length;
    for ( var i = 0; i < length; i++ ) {
       result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return result;
 }
 function init(callback) {
    let idV = `concat.${makeid(7)}.txt`
    let idA = `concat.${makeid(7)}.txt`
    prevVideo = tempVideo;
    tempVideo = idV;
    prevAudio = tempAudio;
    tempAudio = idA;
    mkfifo(idV, 0600);
    mkfifo(idA, 0600);
    callback({v: idV, a: idA})
}

function writeStream(audio, video, key, initV, initA){

        init(({v,a}) => {
            fs.writeFileSync(prevVideo, `ffconcat version 1.0 \nfile 'video' \nfile '${v}'`)
            child.exec(`ffmpeg -decryption_key ${key[0]} -f mp4 -i <(cat ${initV} <(wget -q -O- ${video})) -preset ultrafast -f hls pipe:1 >> video`)
            fs.unlinkSync(prevVideo);            
            fs.writeFileSync(prevAudio, `ffconcat version 1.0 \nfile 'audio' \nfile '${a}'`)
            child.exec(`ffmpeg -decryption_key ${key[1]} -i <(cat ${initA} <(wget -q -O- ${audio})) -preset ultrafast -f hls pipe:1 >> audio`)
            fs.unlinkSync(prevAudio);
        })
}
async function downloadFile(fileUrl, outputLocationPath) {  
    const writer = fs.createWriteStream(outputLocationPath, {flags: "w"})
    return axios({
      method: 'get',
      url: fileUrl,
      responseType: 'stream',
    }).then(response => {
  
      //ensure that the user can call `then()` only when the file has
      //been downloaded entirely.
  
      return new Promise((resolve, reject) => {
        response.data.pipe(writer);
        let error = null;
        writer.on('error', err => {
          error = err;
          writer.close();
          reject(err);
        });
        writer.on('close', () => {
          if (!error) {
            resolve(true);
          }
          //no need to call the reject here, as it will have been called in the
          //'error' stream;
        });
      });
    });
  }
(async () => {
    let mpdURL = process.argv[2];
    let key = process.argv[3];
    let output = process.argv[4];
    let repindex = process.argv[5];
    let index = 0;
    
    let manifest = await axios.get(mpdURL)
    let parsed = mpd.parse(manifest.data, {manifestUri: `${mpdURL.match("(.*)/(.*)")[1]}/`})
    let video = parsed.playlists[repindex || 0]
    index = video.mediaSequence
    await downloadFile(parsed.mediaGroups.AUDIO.audio[Object.keys(parsed.mediaGroups.AUDIO.audio)[0]].playlists[0].segments[0].map.resolvedUri, parsed.mediaGroups.AUDIO.audio[Object.keys(parsed.mediaGroups.AUDIO.audio)[0]].playlists[0].segments[0].map.uri)
    await downloadFile(video.segments[0].map.resolvedUri, video.segments[0].map.uri)
    init(({v,a}) => {
        // console.log(v);
        // console.log(a);
        child.exec(`ffmpeg -y -re -i ${v} -i ${a} -c:v libx264 -tune zerolatency -preset ultrafast -f mpegts pipe:1 > ${output}`, (err, out,stderr) => {
            // console.log(out);
            console.log(err);
            console.log(stderr);
            // if(stderr){
            //     fs.unlinkSync(tempVideo);
            //     fs.unlinkSync(tempAudio);
            // }
        })
        writeStream(
            `${mpdURL.match("(.*)/(.*)")[1]}/${parsed.mediaGroups.AUDIO.audio[Object.keys(parsed.mediaGroups.AUDIO.audio)[0]].playlists[0].segments[0].map.uri.match("(.*)_(.*)\.(.*)")[1]}_${index}${parsed.mediaGroups.AUDIO.audio[Object.keys(parsed.mediaGroups.AUDIO.audio)[0]].playlists[0].segments[0].uri.match(/\.[0-9a-z]+$/i)[0]}`, 
            `${mpdURL.match("(.*)/(.*)")[1]}/${video.segments[0].uri.match("(.*)_(.*)\.(.*)")[1]}_${index}${video.segments[0].uri.match(/\.[0-9a-z]+$/i)[0]}`,
            JSON.parse(key),
            video.segments[0].map.uri,
            parsed.mediaGroups.AUDIO.audio[Object.keys(parsed.mediaGroups.AUDIO.audio)[0]].playlists[0].segments[0].map.uri
        )
        index++;
        // console.log(`segment ${index}`);
        // console.log(`duration ${(video.targetDuration) * 1000}`);
        setInterval(async () => {
            writeStream(
                `${mpdURL.match("(.*)/(.*)")[1]}/${parsed.mediaGroups.AUDIO.audio[Object.keys(parsed.mediaGroups.AUDIO.audio)[0]].playlists[0].segments[0].map.uri.match("(.*)_(.*)\.(.*)")[1]}_${index}${parsed.mediaGroups.AUDIO.audio[Object.keys(parsed.mediaGroups.AUDIO.audio)[0]].playlists[0].segments[0].uri.match(/\.[0-9a-z]+$/i)[0]}`,
                `${mpdURL.match("(.*)/(.*)")[1]}/${video.segments[0].uri.match("(.*)_(.*)\.(.*)")[1]}_${index}${video.segments[0].uri.match(/\.[0-9a-z]+$/i)[0]}`,
                JSON.parse(key),
                video.segments[0].map.uri,
                parsed.mediaGroups.AUDIO.audio[Object.keys(parsed.mediaGroups.AUDIO.audio)[0]].playlists[0].segments[0].map.uri
                )
            index++;
            // console.log(`segment ${index}`);
            // console.log(`duration ${(video.targetDuration) * 1000}`);
        }, (video.targetDuration - 2) * 1000);
        console.log("working");
    })
})()