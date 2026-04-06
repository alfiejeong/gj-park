// [클라이언트 측] 지도를 그리고 데이터를 호출하는 역할
var mainMap = null, currentInfoWindow = null;
var fetchedData = []; 
// [중요] 위에서 복사한 GAS의 '웹 앱 URL'을 여기에 넣으십시오.
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbynz0MYzoBfX1KZ2_igijjHRqzqWFonv2SCQ3MFKoUTnqVcZqcGWvxJnq0AhyXlDwkX/exec";

async function 데이터불러오기() {
    console.log("데이터 각개전투 개시...");
    
    // 1. 구글 시트 데이터 (제보 13건 등) 호출
    try {
        const resSheet = await fetch(SCRIPT_URL + "?type=sheet&t=" + new Date().getTime());
        const dataSheet = await resSheet.json();
        dataSheet.forEach(item => 마커생성실행(item, "제보"));
        console.log("✅ 시트 데이터 로드 완료");
    } catch(e) { console.error("시트 로드 실패", e); }

    // 2. 서울시 데이터 (GAS 중계) 호출
    try {
        const resSeoul = await fetch(SCRIPT_URL + "?type=seoul&t=" + new Date().getTime());
        const dataSeoul = await resSeoul.json();
        dataSeoul.forEach(item => 마커생성실행(item, "서울시"));
        console.log("✅ 서울시 데이터 로드 완료:", dataSeoul.length, "건");
    } catch(e) { console.error("서울시 로드 실패", e); }
}

function 마커생성실행(item, source) {
    if (!mainMap || !item.lat || !item.lng) return;

    const marker = new naver.maps.Marker({
        position: new naver.maps.LatLng(item.lat, item.lng),
        map: mainMap,
        icon: {
            content: `<div class="parking-label ${source === '서울시' ? 'seoul-style' : ''}">${item.type}</div>`,
            anchor: new naver.maps.Point(20, 10)
        }
    });

    const infoWindow = new naver.maps.InfoWindow({
        content: `<div style="padding:10px;"><h4>${item.name}</h4><p>${item.address}</p></div>`
    });

    naver.maps.Event.addListener(marker, "click", function() {
        if (currentInfoWindow) currentInfoWindow.close();
        infoWindow.open(mainMap, marker);
        currentInfoWindow = infoWindow;
    });
}