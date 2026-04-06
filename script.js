var mainMap = null;
var currentInfoWindow = null;
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxpvied4dnChJFGX0hxGU7St2JJucvyq0MBTJpKidKkPrYtvr0LRZ-79xHOark2UQml/exec";

// [핵심] 페이지 로드 시 지도를 먼저 만듭니다.
window.onload = function() {
    console.log("지도 판형 제작 개시...");
    const mapOptions = {
        center: new naver.maps.LatLng(37.5665, 126.9780),
        zoom: 11
    };
    mainMap = new naver.maps.Map('map', mapOptions);

    // 지도가 떴으니 이제 취재(데이터 로드) 시작합니다.
    데이터불러오기();
};

async function 데이터불러오기() {
    // 1. 구글 시트 데이터 (제보 13건) - 무조건 가져오기
    fetch(SCRIPT_URL + "?type=sheet")
        .then(res => res.json())
        .then(data => {
            console.log("✅ 시트 데이터 로드:", data.length);
            data.forEach(item => 마커생성(item, "제보"));
        })
        .catch(err => console.error("시트 로드 실패:", err));

    // 2. 서울시 데이터 (우회 중계) - 따로 가져오기
    fetch(SCRIPT_URL + "?type=seoul")
        .then(res => res.json())
        .then(data => {
            console.log("✅ 서울시 데이터 로드:", data.length);
            data.forEach(item => 마커생성(item, "서울시"));
        })
        .catch(err => console.error("서울시 로드 실패:", err));
}

function 마커생성(item, source) {
    if (!mainMap || !item.lat || !item.lng) return;

    const marker = new naver.maps.Marker({
        position: new naver.maps.LatLng(item.lat, item.lng),
        map: mainMap,
        icon: {
            content: `<div class="parking-label ${source === '서울시' ? 'seoul-style' : ''}">${item.type || '무료'}</div>`,
            anchor: new naver.maps.Point(20, 10)
        }
    });

    const info = new naver.maps.InfoWindow({
        content: `<div style="padding:10px;"><b>${item.name}</b><br>${item.address}</div>`
    });

    naver.maps.Event.addListener(marker, "click", function() {
        if (currentInfoWindow) currentInfoWindow.close();
        info.open(mainMap, marker);
        currentInfoWindow = info;
    });
}