var mainMap = null, currentInfoWindow = null;
var fetchedData = []; 
// [필수] 구글 앱스 스크립트 '새 배포' 후 생성된 주소로 교체하십시오.
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxwa0mUQxW0FucoastdkCbtqOlmD4L66H1LxG9vf7mRqdx01NVoL89We8bUX1Uzbfip/exec";

async function 데이터불러오기() {
    console.log("데이터 개별 취재 개시...");
    
    // [독립 호출 1] 구글 시트 데이터
    try {
        const resSheet = await fetch(`${SCRIPT_URL}?type=sheet&t=${new Date().getTime()}`);
        const dataSheet = await resSheet.json();
        console.log("✅ 구글 시트 제보 로드 완료:", dataSheet.length, "건");
        dataSheet.forEach(item => 마커생성실행(item, "제보"));
    } catch(e) { console.error("시트 로드 실패", e); }

    // [독립 호출 2] 서울시 데이터 (GAS 우회)
    try {
        const resSeoul = await fetch(`${SCRIPT_URL}?type=seoul&t=${new Date().getTime()}`);
        const dataSeoul = await resSeoul.json();
        
        if (dataSeoul && dataSeoul.length > 0) {
            console.log("✅ 서울시 무료 명당 로드 완료:", dataSeoul.length, "건");
            dataSeoul.forEach(item => 마커생성실행(item, "서울시"));
        } else {
            console.warn("⚠️ 서울시 수신 데이터가 여전히 0건입니다. GAS 필터 확인 필요.");
        }
    } catch(e) { console.error("서울시 우회 로드 실패", e); }
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
        content: `<div style="padding:15px; min-width:200px; line-height:1.5; background:#fff; border:3px solid #FFD400; border-radius:12px;">
            <h4 style="margin:0; color:#FF5252;">📍 ${item.name}</h4>
            <div style="font-size:12px; color:#666;">${item.address}</div>
            <div style="font-size:13px; margin-top:5px;"><b>유형:</b> ${item.type} (${item.capacity}면)</div>
            <div style="font-size:12px; background:#f9f9f9; padding:8px; margin-top:8px; border-radius:6px;">${item.note}</div>
            <div style="font-size:11px; color:#999; margin-top:8px; text-align:right;">출처: ${item.user}</div>
        </div>`,
        borderWidth: 0, disableAnchor: true, pixelOffset: new naver.maps.Point(0, -10)
    });

    naver.maps.Event.addListener(marker, "click", function() {
        if (currentInfoWindow) currentInfoWindow.close();
        infoWindow.open(mainMap, marker);
        currentInfoWindow = infoWindow;
    });
}