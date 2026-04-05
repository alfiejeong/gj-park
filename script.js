var mainMap = null, reportMarker = null, selectedCoord = null;
var currentInfoWindow = null; 
var fetchedData = null; 
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbytKkWpWDrqEebLCdxmcSqeSMZYT4YVd7jtzyMAGr02Kwebqj6j2jxXMOUhfIFOmaAH/exec";

window.onload = function() {
    // 1. [핵심 최적화] 로컬에 저장된 이전 데이터가 있다면 즉시 로드
    const cachedData = localStorage.getItem('gj-cache');
    if (cachedData) {
        fetchedData = JSON.parse(cachedData);
        console.log("로컬 데이터를 먼저 사용하여 마커를 표시합니다.");
    }

    // 2. [핵심 최적화] 지도가 그려지기 전, 백그라운드에서 최신 데이터 수신 시작
    데이터불러오기();

    // 3. 지도 즉시 생성 (사용자가 기다리지 않게 함)
    var defaultCenter = new naver.maps.LatLng(37.5665, 126.9780); 
    mainMap = new naver.maps.Map('map', {
        center: defaultCenter,
        zoom: 15,
        logoControl: false
    });

    // 4. 지도 생성 직후, 로컬 데이터가 있다면 즉시 마커 배치
    if (fetchedData) 마커표시실행();

    // 5. 접속 즉시 내 위치 찾기 (백그라운드 처리)
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(function(pos) {
            var myLoc = new naver.maps.LatLng(pos.coords.latitude, pos.coords.longitude);
            if(mainMap) {
                mainMap.setCenter(myLoc);
                mainMap.setZoom(16);
            }
        }, function(err) {
            console.warn("위치 권한 거부됨.");
        });
    }

    // 닉네임 로드
    const savedNick = localStorage.getItem('gj-nick');
    if(savedNick) document.getElementById('user-nick').value = savedNick;

    // 지도 클릭 리스너 (정보창 닫기 및 초기화)
    naver.maps.Event.addListener(mainMap, 'click', function(e) {
        if (currentInfoWindow) {
            currentInfoWindow.close();
            currentInfoWindow = null;
        }
        
        // 제보 마커 초기화 (명당 제보 시 활용)
        if (reportMarker) {
            reportMarker.setMap(null);
            reportMarker = null;
        }
    });
};

// [최적화] 데이터 수신 및 로컬 스토리지 업데이트
async function 데이터불러오기() {
    try {
        const response = await fetch(SCRIPT_URL + "?t=" + new Date().getTime());
        const newData = await response.json();
        
        // 최신 데이터 캐시 저장
        localStorage.setItem('gj-cache', JSON.stringify(newData));
        fetchedData = newData;
        
        // 지도가 이미 생성되어 있다면 최신 데이터로 마커 업데이트
        if (mainMap) 마커표시실행();
    } catch (e) { 
        console.error("데이터 로딩 실패", e); 
    }
}
// [신규] 마커를 실제 지도에 뿌리는 공통 함수
function 마커표시실행() {
    if (!fetchedData || !mainMap) return;

    // 데이터 루프 돌며 마커 생성
    fetchedData.forEach(item => {
        const marker = new naver.maps.Marker({
            position: new naver.maps.LatLng(item.lat, item.lng), 
            map: mainMap,
            icon: { 
                content: `<div class="parking-label">${item.type}</div>`, 
                anchor: new naver.maps.Point(20, 10) 
            }
        });

        const infoWindow = new naver.maps.InfoWindow({
            content: `
                <div style="padding:15px; min-width:200px; line-height:1.5; background-color: #fff; border: 3px solid #FFD400; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
                    <h4 style="margin:0; color:#FF5252; font-size:16px;">📍 ${item.name || '장소명 없음'}</h4>
                    <div style="font-size:12px; color:#666; margin-bottom:5px;">${item.address || '주소 정보 없음'}</div>
                    <div style="font-size:13px; margin-top:5px; color:#333;">
                        <b>유형:</b> ${item.type} (${item.capacity || 0})
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

        naver.maps.Event.addListener(marker, "click", function() {
            if (currentInfoWindow) currentInfoWindow.close();
            infoWindow.open(mainMap, marker);
            currentInfoWindow = infoWindow;
        });
    });
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
        // 제보 성공 시 로컬 캐시 삭제 (최신 데이터 갱신 유도)
        localStorage.removeItem('gj-cache');
        alert("제보 성공!"); 
        location.reload();
    } catch (e) { 
        alert("전송 실패"); 
    }
}