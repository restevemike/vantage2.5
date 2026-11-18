/** Pure helpers for the optional NOOP/Wearable BLE dashboard. */
export function decodeHeartRateMeasurement(view) {
 if (!view || view.byteLength < 2) return null;
 const flags=view.getUint8(0);
 const is16=(flags&1)!==0;
 if(is16&&view.byteLength<3)return null;
 const bpm=is16?view.getUint16(1,true):view.getUint8(1);
 if(!Number.isInteger(bpm)||bpm<30||bpm>250)return null;
 return bpm;
}
export function heartRateZone(bpm,maxHr) {
 if(!Number.isFinite(maxHr)||maxHr<100||maxHr>240)return "No HR max set";
 const p=100*bpm/maxHr;
 return p<60?"Below zone 1":p<70?"Zone 1":p<80?"Zone 2":p<90?"Zone 3":p<100?"Zone 4":"Zone 5";
}
export function summarizeHeartRate(points) {
 const values=(Array.isArray(points)?points:[]).filter(p=>Number.isFinite(p.bpm)&&p.bpm>=30&&p.bpm<=250);
 if(!values.length)return {count:0,average:null,peak:null,minimum:null};
 return {count:values.length,average:Math.round(values.reduce((s,p)=>s+p.bpm,0)/values.length),
  peak:Math.max(...values.map(p=>p.bpm)),minimum:Math.min(...values.map(p=>p.bpm))};
}
export function reviewFreshness(review,now=Date.now()){
 const date=review?.summary?.latestDailyDate;
 if(!date)return "No daily NOOP data received";
 const end=Date.parse(date+"T23:59:59Z");
 if(!Number.isFinite(end))return "Unknown source date";
 return end<now-36*60*60*1000?"Older NOOP daily snapshot":"Latest available NOOP daily snapshot";
}
