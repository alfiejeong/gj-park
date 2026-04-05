var mainMap = null, reportMarker = null, selectedCoord = null;
var currentInfoWindow = null; 
var fetchedData = null; 
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbytKkWpWDrqEebLCdxmcSqeSMZYT4YVd7jtzyMAGr02Kwebqj6j2jxXMOUhfIFOmaAH/exec";

window.onload = function() {
    // 1. 데이터 선제 로드 (캐시 활용)
    const cachedData = localStorage.getItem('gj-cache');
    if (cachedData) { fetchedData = JSON.parse(cachedData); }

    // 2. 백그라운드 최신 데이터 호출
    데이터불러오기();

    // 3. 지도 즉시 생성
    mainMap = new naver.maps.Map('map', {
        center: new naver.maps.LatLng(37.5665, 126.9780),
        zoom: 15,
        logoControl: false
    });

    // 4. 캐시 데이터 즉시 렌더링
    if (fetchedData) 마커표시실행();

    // 5. 실시간 위치 파악 및 이동
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(function(pos) {
            var myLoc = new naver.maps.LatLng(pos.coords.latitude, pos.coords.longitude);
            if(mainMap) { mainMap.setCenter(myLoc); mainMap.setZoom(16); }
        });
    }

    const savedNick = localStorage.getItem('gj-nick');
    if(savedNick) document.getElementById('user-nick').value = savedNick;

    // 지도 클릭 시 초기화 (상세창 닫기 및 제보 취소)
    naver.maps.Event.addListener(mainMap, 'click', function() {
        if (currentInfoWindow) { currentInfoWindow.close(); currentInfoWindow = null; }
        if (reportMarker) { reportMarker.setMap(null); reportMarker = null; }
    });
};

async function 데이터불러오기() {
    try {
        const response = await fetch(SCRIPT_URL + "?t=" + new Date().getTime());
        const data = await response.json();
        localStorage.setItem('gj-cache', JSON.stringify(data));
        fetchedData = data;
        if (mainMap) 마커표시실행();
    } catch (e) { console.error("로딩 실패", e); }
}

function 마커표시실행() {
    if (!fetchedData || !mainMap) return;
    fetchedData.forEach(item => {
        const marker = new naver.maps.Marker({
            position: new naver.maps.LatLng(item.lat, item.lng), map: mainMap,
            icon: { content: `<div class="parking-label">${item.type}</div>`, anchor: new naver.maps.Point(20, 10) }
        });
        const infoWindow = new naver.maps.InfoWindow({
            content: `<div style="padding:15px; min-width:200px; line-height:1.5; background-color: #fff; border: 3px solid #FFD400; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
                <h4 style="margin:0; color:#FF5252; font-size:16px;">📍 ${item.name || '무명'}</h4>
                <div style="font-size:12px; color:#666; margin-bottom:5px;">${item.address || '주소 정보 없음'}</div>
                <div style="font-size:13px; margin-top:5px; color:#333;"><b>유형:</b> ${item.type} (${item.capacity || 0}면)</div>
                <div style="font-size:12px; background:#f9f9f9; padding:8px; margin-top:8px; border-radius:6px; color:#555; border-left:3px solid #FFD400;">${item.note || '꿀팁 준비 중'}</div>
                <div style="font-size:11px; color:#999; margin-top:8px; text-align:right;">제보자: ${item.user || '익명'}</div>
            </div>`,
            borderWidth: 0, disableAnchor: true, pixelOffset: new naver.maps.Point(0, -10)
        });
        naver.maps.Event.addListener(marker, "click", function() {
            if (currentInfoWindow) currentInfoWindow.close();
            infoWindow.open(mainMap, marker);
            currentInfoWindow = infoWindow;
        });
    });
}

function 내위치찾기() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(function(pos) {
            mainMap.setCenter(new naver.maps.LatLng(pos.coords.latitude, pos.coords.longitude));
            mainMap.setZoom(17);
        });
    }
}

function 제보하기() {
    alert("지도를 클릭하여 제보 위치를 선택해주세요.");
    const listener = naver.maps.Event.addListener(mainMap, 'click', function(e) {
        if (reportMarker) reportMarker.setMap(null);
        selectedCoord = e.coord;
        reportMarker = new naver.maps.Marker({
            position: selectedCoord, map: mainMap,
            icon: { content: '<div class="reporting-pin">▼</div>', anchor: new naver.maps.Point(20, 40) }
        });
        naver.maps.Service.reverseGeocode({ coords: selectedCoord }, function(status, response) {
            if (status === naver.maps.Service.Status.OK) {
                document.getElementById('place-addr').value = response.v2.address.jibunAddress || response.v2.address.roadAddress;
                document.getElementById('report-modal').style.display = 'block';
                document.getElementById('modal-overlay').style.display = 'block';
            }
        });
        naver.maps.Event.removeListener(listener);
    });
}

function 닫기제보창() {
    document.getElementById('report-modal').style.display = 'none';
    document.getElementById('modal-overlay').style.display = 'none';
    if (reportMarker) { reportMarker.setMap(null); reportMarker = null; }
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
        await fetch(SCRIPT_URL, { method: 'POST', body: JSON.stringify(payload), mode: 'no-cors' });
        localStorage.removeItem('gj-cache'); // 최신화 강제
        alert("제보 성공!"); location.reload();
    } catch (e) { alert("전송 실패"); }
}