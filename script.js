// 전역 변수 유지
var map = null; 
var reportMarker = null; 
var selectedCoord = null;
var currentInfoWindow = null; 
var fetchedData = null; // [신규] 미리 받은 데이터를 담아둘 주머니
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzQsFeRNYbSGxBQpiqnZFBNoLaDHE3bNkJuPukTEhcZeUWj4n1ayM_Q40qCuqUzXNFw/exec";

window.onload = function() {
    // 1. 닉네임 로드
    const savedNick = localStorage.getItem('gj-nick');
    if (savedNick) document.getElementById('user-nick').value = savedNick;

    // 2. [초고속] 지도 그리기도 전에 데이터부터 원격 호출 (가장 먼저 실행)
    데이터불러오기();

    // 3. 지도 생성 프로세스 시작
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(success, error);
    } else {
        startMap(new naver.maps.LatLng(37.555145, 126.970590));
    }
};

async function 데이터불러오기() {
    try {
        // 캐시 방지 및 호출
        const response = await fetch(SCRIPT_URL + "?t=" + new Date().getTime());
        fetchedData = await response.json();
        console.log("데이터 수신 완료 (대기 중)");
        
        // 만약 지도가 이미 그려졌다면 바로 마커 표시 실행
        if (map) 마커표시실행();
    } catch (e) {
        console.error("데이터 수신 실패:", e);
    }
}

function startMap(location) {
    map = new naver.maps.Map('map', {
        center: location,
        zoom: 16
    });

    // 지도가 준비되면 즉시 마커 표시 시도
    naver.maps.Event.once(map, 'init', function() {
        if (fetchedData) 마커표시실행();
    });

    // 지도 클릭 초기화 (기존 유지)
    naver.maps.Event.addListener(map, 'click', function() {
        if (currentInfoWindow) { currentInfoWindow.close(); currentInfoWindow = null; }
        if (reportMarker) { reportMarker.setMap(null); reportMarker = null; }
    });
}

// [핵심] 수신된 데이터를 지도에 실제로 뿌리는 전용 함수
function 마커표시실행() {
    if (!fetchedData || !map) return;

    fetchedData.forEach(item => {
        const finalAddr = item.address || item.addr || item.주소 || "주소 정보 없음";
        
        const marker = new naver.maps.Marker({
            position: new naver.maps.LatLng(item.lat, item.lng), 
            map: map,
            icon: { 
                content: `<div class="parking-label">${item.type || '주차'}</div>`, 
                anchor: new naver.maps.Point(20, 10) 
            }
        });

        const infoWindow = new naver.maps.InfoWindow({
            content: `
            <div style="padding:15px; min-width:200px; line-height:1.5; background-color: #fff; border: 3px solid #FFD400; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
                <h4 style="margin:0; color:#FF5252; font-size:16px;">📍 ${item.name || '무명 장소'}</h4>
                <div style="font-size:12px; color:#666; margin-bottom:5px;">${finalAddr}</div>
                <div style="font-size:13px; margin-top:5px; color:#333;">
                    <b>유형:</b> <span style="color:#000;">${item.type || '일반'}</span> (${item.capacity || 0}면)
                </div>
                <div style="font-size:12px; background:#f9f9f9; padding:8px; margin-top:8px; border-radius:6px; color:#555; border-left:3px solid #FFD400;">
                    ${item.note || '꿀팁 준비 중'}
                </div>
                <div style="font-size:11px; color:#999; margin-top:8px; text-align:right;">제보자: ${item.user || '익명'}</div>
                <div style="font-size:10px; color:#ff5252; font-weight:bold; margin-top:10px; border-top:1px dashed #eee; padding-top:5px; text-align:center;">
                    ⚠️ 구마적 한마디: "여기 꽉 찼으면 바로 제보 때려주쇼!"
                </div>
            </div>`,
            borderWidth: 0,
            disableAnchor: true,
            pixelOffset: new naver.maps.Point(0, -10)
        });

        naver.maps.Event.addListener(marker, "click", function(e) {
            if (currentInfoWindow) currentInfoWindow.close();
            infoWindow.open(map, marker);
            currentInfoWindow = infoWindow;
            if (e.domEvent) e.domEvent.stopPropagation(); 
        });
    });
    console.log("구마적 마커 렌더링 완료");
}