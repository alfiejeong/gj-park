// [보존] 전역 변수 설정
var mainMap = null;
var currentInfoWindow = null;
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyUZokFE7VTt17TwUsvolZgP_O-390lms9ID6WFxDU3e9KkhR2Dg3SSMrCxlmeTBpIs/exec";

// [1] 지도 초기화 (최우선 실행)
function initMap() {
    console.log("거지주차 지도 판형 제작 중...");
    const mapOptions = {
        center: new naver.maps.LatLng(37.5665, 126.9780),
        zoom: 12,
        logoControl: false,
        mapDataControl: false
    };
    mainMap = new naver.maps.Map('map', mapOptions);

    // 지도가 생성된 후 데이터를 불러옵니다.
    데이터불러오기();
}

// [2] 데이터 각개전투 호출
async function 데이터불러오기() {
    console.log("데이터 개별 취재 시작...");

    // A. 구글 시트 데이터 (제보 13건 등)
    try {
        fetch(`${SCRIPT_URL}?type=sheet&t=${new Date().getTime()}`)
            .then(res => res.json())
            .then(data => {
                console.log("✅ 구글 시트 제보 수신:", data.length, "건");
                data.forEach(item => 마커생성실행(item, "제보"));
            });
    } catch(e) { console.error("시트 호출 실패", e); }

    // B. 서울시 데이터 (GAS 중계)
    try {
        fetch(`${SCRIPT_URL}?type=seoul&t=${new Date().getTime()}`)
            .then(res => res.json())
            .then(data => {
                if (data && data.length > 0) {
                    console.log("✅ 서울시 무료 명당 수신:", data.length, "건");
                    data.forEach(item => 마커생성실행(item, "서울시"));
                } else {
                    console.warn("⚠️ 서울시 수신 데이터 0건 (필터 확인 필요)");
                }
            });
    } catch(e) { console.error("서울시 호출 실패", e); }
}

// [3] 마커 생성 함수
function 마커생성실행(item, source) {
    if (!mainMap || !item.lat || !item.lng) return;

    const marker = new naver.maps.LatLng(item.lat, item.lng);
    const naverMarker = new naver.maps.Marker({
        position: marker,
        map: mainMap,
        icon: {
            content: `<div class="parking-label ${source === '서울시' ? 'seoul-style' : ''}">${item.type || '무료'}</div>`,
            anchor: new naver.maps.Point(20, 10)
        }
    });

    const infoWindow = new naver.maps.InfoWindow({
        content: `<div style="padding:15px; min-width:200px; line-height:1.5;">
            <h4 style="margin:0; color:#FF5252;">📍 ${item.name}</h4>
            <p style="font-size:12px; margin:5px 0;">${item.address}</p>
            <div style="font-size:11px; color:#999;">출처: ${item.user}</div>
        </div>`,
        borderWidth: 0, disableAnchor: true
    });

    naver.maps.Event.addListener(naverMarker, "click", function() {
        if (currentInfoWindow) currentInfoWindow.close();
        infoWindow.open(mainMap, naverMarker);
        currentInfoWindow = infoWindow;
    });
}

// 페이지 로드 시 실행
window.onload = initMap;