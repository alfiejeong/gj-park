// [보존] 전역 변수 및 설정
var map = null; 
var reportMarker = null; 
var selectedCoord = null;
var currentInfoWindow = null; 
var fetchedData = null; 
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzQsFeRNYbSGxBQpiqnZFBNoLaDHE3bNkJuPukTEhcZeUWj4n1ayM_Q40qCuqUzXNFw/exec";

// [보존] 서비스 시작점
window.onload = function() {
    // 1. 데이터부터 즉시 호출 (백그라운드)
    데이터불러오기();

    // 2. 지도 생성 (위치 파악보다 지도를 먼저 그리는 것이 체감상 빠름)
    // 일단 기본 좌표로 지도를 즉시 띄웁니다.
    startMap(new naver.maps.LatLng(37.555145, 126.970590));

    // 3. 그 후 실제 위치를 파악하여 지도를 이동시킵니다.
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(function(pos) {
            const myLoc = new naver.maps.LatLng(pos.coords.latitude, pos.coords.longitude);
            if(map) map.setCenter(myLoc);
        });
    }

    const savedNick = localStorage.getItem('gj-nick');
    if (savedNick) document.getElementById('user-nick').value = savedNick;
};

function startMap(location) {
    // [핵심] 지도가 흰 화면으로 남지 않도록 즉시 생성
    map = new naver.maps.Map('map', {
        center: location,
        zoom: 16,
        logoControl: false
    });

    // 데이터가 이미 도착해 있다면 즉시 마커 표시
    if (fetchedData) 마커표시실행();

    naver.maps.Event.addListener(map, 'click', function() {
        if (currentInfoWindow) { currentInfoWindow.close(); currentInfoWindow = null; }
        if (reportMarker) { reportMarker.setMap(null); reportMarker = null; }
    });
}

async function 데이터불러오기() {
    try {
        // [로딩 알림] 데이터 수신 전까지 콘솔이나 UI에 상태 표시 가능
        console.log("구마적 데이터 수신 중...");
        const response = await fetch(SCRIPT_URL + "?t=" + new Date().getTime());
        fetchedData = await response.json();
        
        // 데이터가 도착하면 즉시 마커 주입
        if (map) 마커표시실행();
    } catch (e) {
        console.error("데이터 수신 실패:", e);
    }
}

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
                <h4 style="margin:0; color:#FF5252; font-size:16px;">📍 ${item.name || '무명'}</h4>
                <div style="font-size:12px; color:#666; margin-bottom:5px;">${finalAddr}</div>
                <div style="font-size:13px; margin-top:5px; color:#333;">
                    <b>유형:</b> ${item.type || '일반'} (${item.capacity || 0}면)
                </div>
                <div style="font-size:12px; background:#f9f9f9; padding:8px; margin-top:8px; border-radius:6px; color:#555; border-left:3px solid #FFD400;">
                    ${item.note || '꿀팁 준비 중'}
                </div>
                <div style="font-size:11px; color:#999; margin-top:8px; text-align:right;">제보자: ${item.user || '익명'}</div>
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
    console.log("데이터 렌더링 완료!");
}

function 내위치찾기() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(function(pos) {
            const curr = new naver.maps.LatLng(pos.coords.latitude, pos.coords.longitude);
            map.setCenter(curr);
            map.setZoom(17);
        });
    }
}

function 제보하기() {
    alert("지도를 클릭하여 정확한 제보 위치를 선택해주세요.");
    const listener = naver.maps.Event.addListener(map, 'click', function(e) {
        if (reportMarker) reportMarker.setMap(null);
        selectedCoord = e.coord;
        reportMarker = new naver.maps.Marker({
            position: selectedCoord, map: map,
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
    document.getElementById('submit-btn').innerText = "전송 중...";
    try {
        await fetch(SCRIPT_URL, { method: 'POST', body: JSON.stringify(payload), mode: 'no-cors' });
        alert("🎉 제보 성공!"); location.reload();
    } catch (e) { alert("전송 실패"); }
}