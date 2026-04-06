var mainMap = null;
var currentInfoWindow = null;

// [필수] 본인의 구글 앱스 스크립트 '새 배포' 후 생성된 URL을 넣으십시오.
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycby6aS6HdAyYEuTMAU5HLUa7VAFs9rN0OY-8xi3YRS5o0zVztzWNRMVu-lIei95F433I/exec";

// 지도를 먼저 그립니다.
function initMap() {
    const mapOptions = {
        center: new naver.maps.LatLng(37.5665, 126.9780),
        zoom: 12
    };
    mainMap = new naver.maps.Map('map', mapOptions);
    
    // 지도가 뜬 후 데이터 호출 시작
    데이터불러오기();
}

async function 데이터불러오기() {
    // 1. 구글 시트 데이터 (제보 내역)
    fetch(`${SCRIPT_URL}?type=sheet`)
        .then(res => res.json())
        .then(data => {
            console.log("✅ 시트 데이터 로드 완료:", data.length);
            data.forEach(item => 마커생성(item, "제보"));
        }).catch(e => console.error("시트 로드 실패:", e));

    // 2. 서울시 데이터 (GAS 중계)
    fetch(`${SCRIPT_URL}?type=seoul`)
        .then(res => res.json())
        .then(data => {
            console.log("✅ 서울시 데이터 로드 완료:", data.length);
            data.forEach(item => 마커생성(item, "서울시"));
        }).catch(e => console.error("서울시 로드 실패:", e));
}

function 마커생성(item, source) {
    if (!mainMap || !item.lat || !item.lng) return;

    const marker = new naver.maps.Marker({
        position: new naver.maps.LatLng(item.lat, item.lng),
        map: mainMap,
        icon: {
            content: `<div class="parking-label ${source === '서울시' ? 'seoul-style' : ''}">${item.type}</div>`,
            anchor: new naver.maps.Point(20, 10)
        }
    });

    const info = new naver.maps.InfoWindow({
        content: `<div style="padding:10px;"><b>${item.name}</b><br><small>${item.address}</small></div>`
    });

    naver.maps.Event.addListener(marker, "click", () => {
        if (currentInfoWindow) currentInfoWindow.close();
        info.open(mainMap, marker);
        currentInfoWindow = info;
    });
}

// 스크립트 로드 완료 시 실행
window.onload = initMap;