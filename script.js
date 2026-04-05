var mainMap = null, reportMarker = null, selectedCoord = null;
var currentInfoWindow = null; // 현재 열린 정보창을 저장할 변수 추가
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzQsFeRNYbSGxBQpiqnZFBNoLaDHE3bNkJuPukTEhcZeUWj4n1ayM_Q40qCuqUzXNFw/exec";

window.onload = function() {
    // 1. 기본 중심점 (위치 권한 거부 시 대비)
    var defaultCenter = new naver.maps.LatLng(37.5665, 126.9780); 
    
    // 2. 지도 먼저 생성
    mainMap = new naver.maps.Map('map', {
        center: defaultCenter,
        zoom: 15,
        logoControl: false
    });

    // 3. [핵심 추가] 접속 즉시 내 위치 찾기
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(function(pos) {
            var myLoc = new naver.maps.LatLng(pos.coords.latitude, pos.coords.longitude);
            mainMap.setCenter(myLoc); // 내 위치로 지도 이동
            mainMap.setZoom(16);      // 보기 좋게 줌인
        }, function(err) {
            console.warn("위치 권한이 거부되었습니다. 기본 위치로 표시합니다.");
        });
    }

    // 기존 닉네임 로드 및 클릭 이벤트 로직은 이 아래에 그대로 유지...
    const savedNick = localStorage.getItem('gj-nick');
    if(savedNick) document.getElementById('user-nick').value = savedNick;

naver.maps.Event.addListener(mainMap, 'click', function(e) {
    // 추가: 지도를 클릭하면 열려 있는 정보창을 닫음
    if (currentInfoWindow) {
        currentInfoWindow.close();
        currentInfoWindow = null;
    }
    
    // (기존 역지오코딩 및 제보 핀 생성 로직은 유지)
    selectedCoord = e.coord;
    // ... 이하 생략 ...
});

    데이터불러오기();
};

async function 데이터불러오기() {
    try {
        const response = await fetch(SCRIPT_URL + "?t=" + new Date().getTime());
        const data = await response.json();

        console.log("불러온 데이터:", data); // 개발자 도구(F12)에서 데이터가 오는지 확인용

        data.forEach(item => {
            const marker = new naver.maps.Marker({
                position: new naver.maps.LatLng(item.lat, item.lng), map: mainMap,
                icon: { content: `<div class="parking-label">${item.type}</div>`, anchor: new naver.maps.Point(20, 10) }
            });
            const infoWindow = new naver.maps.InfoWindow({
    content: `
        <div style="padding:15px; min-width:200px; line-height:1.5; background-color: #fff; border: 1px solid #ddd; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
            <h4 style="margin:0; color:#FF5252; font-size:16px;">📍 ${item.name}</h4>
            <div style="font-size:12px; color:#666; margin-bottom:5px;">${item.address}</div>
            <div style="font-size:13px; margin-top:5px; color:#333;">
                <b>유형:</b> <span style="color:#000;">${item.type}</span> (${item.capacity})
            </div>
            <div style="font-size:12px; background:#f9f9f9; padding:8px; margin-top:8px; border-radius:6px; color:#555; border-left:3px solid #FFD400;">
                ${item.note}
            </div>
            <div style="font-size:11px; color:#999; margin-top:8px; text-align:right;">제보자: ${item.user}</div>
        </div>`,
    borderWidth: 0,
    backgroundColor: "#ffffff", // 배경을 흰색으로 고정
    disableAnchor: true,
    pixelOffset: new naver.maps.Point(0, -10)
});
naver.maps.Event.addListener(marker, "click", function() {
    // 이미 다른 창이 열려 있다면 닫기
    if (currentInfoWindow) {
        currentInfoWindow.close();
    }

    // 클릭한 마커의 정보창 열기
    if (infoWindow.getMap()) {
        infoWindow.close();
        currentInfoWindow = null;
    } else {
        infoWindow.open(mainMap, marker);
        currentInfoWindow = infoWindow; // 현재 열린 창으로 등록
    }
});
        });
    } catch (e) {
        console.error("데이터 로딩 실패:", e);
    }
}

function 닫기제보창() {
    document.getElementById('report-modal').style.display = 'none';
    document.getElementById('modal-overlay').style.display = 'none';
}

async function 저장제보() {
    const user = document.getElementById('user-nick').value;
    const addr = document.getElementById('place-addr').value;
    const name = document.getElementById('place-name').value;
    const type = document.getElementById('parking-type').value;
    const cap = document.getElementById('parking-cap').value;
    const note = document.getElementById('place-note').value;
    if (!user || !name || !type) { alert("필수 정보를 입력하세요!"); return; }
    localStorage.setItem('gj-nick', user);
    const payload = { user: user, address: addr, name: name, type: type, capacity: cap, note: note, lat: selectedCoord.lat(), lng: selectedCoord.lng() };
    try {
        fetch(SCRIPT_URL, { method: 'POST', body: JSON.stringify(payload), mode: 'no-cors' });
        alert("제보 성공!"); location.reload();
    } catch (e) { alert("전송 실패"); }
}