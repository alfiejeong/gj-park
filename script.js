var map = null; 
var reportMarker = null; 
var selectedCoord = null;
var currentInfoWindow = null; 
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzQsFeRNYbSGxBQpiqnZFBNoLaDHE3bNkJuPukTEhcZeUWj4n1ayM_Q40qCuqUzXNFw/exec";

window.onload = function() {
    // 닉네임 불러오기
    const savedNick = localStorage.getItem('gj-nick');
    if (savedNick) document.getElementById('user-nick').value = savedNick;

    // 시작 시 위치 파악
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(success, error);
    } else {
        startMap(new naver.maps.LatLng(37.555145, 126.970590));
    }
};

function success(position) {
    const myLocation = new naver.maps.LatLng(position.coords.latitude, position.coords.longitude);
    startMap(myLocation);
}

function error() {
    console.warn("위치 권한 거부됨. 기본 위치로 시작합니다.");
    startMap(new naver.maps.LatLng(37.555145, 126.970590));
}

function startMap(location) {
    // 변수명을 map으로 통일합니다
    map = new naver.maps.Map('map', {
        center: location,
        zoom: 16
    });
    데이터불러오기();
}

// [내 위치] 버튼 기능
function 내위치찾기() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(function(position) {
            const curr = new naver.maps.LatLng(position.coords.latitude, position.coords.longitude);
            map.setCenter(curr);
            map.setZoom(17);
        });
    } else {
        alert("이 브라우저에서는 위치 기능을 사용할 수 없습니다.");
    }
}

// [명당 제보] 버튼 기능
function 제보하기() {
    alert("지도를 클릭하여 정확한 제보 위치를 선택해주세요.");
    
    const listener = naver.maps.Event.addListener(map, 'click', function(e) {
        if (reportMarker) reportMarker.setMap(null);
        
        selectedCoord = e.coord;
        reportMarker = new naver.maps.Marker({
            position: selectedCoord,
            map: map,
            icon: { content: '<div style="font-size:24px;">📍</div>', anchor: new naver.maps.Point(12, 24) }
        });

        // 주소 변환 (Geocoder 서비스 필수)
        naver.maps.Service.reverseGeocode({ coords: selectedCoord }, function(status, response) {
            if (status === naver.maps.Service.Status.OK) {
                document.getElementById('place-addr').value = response.v2.address.jibunAddress || response.v2.address.roadAddress;
                document.getElementById('report-modal').style.display = 'block';
                document.getElementById('modal-overlay').style.display = 'block';
            }
        });
        
        // 클릭 이벤트 한 번 발생 후 제거 (중복 방지)
        naver.maps.Event.removeListener(listener);
    });
}

async function 데이터불러오기() {
    try {
        const response = await fetch(SCRIPT_URL + "?t=" + new Date().getTime());
        const data = await response.json();

        data.forEach(item => {
            const marker = new naver.maps.Marker({
                position: new naver.maps.LatLng(item.lat, item.lng), 
                map: map, // mainMap에서 map으로 수정
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
                    <div style="font-size:10px; color:#ff5252; margin-top:10px; border-top:1px dashed #eee; pt:5px;">
                        ⚠️ 구마적 한마디: "여기 자리 없으면 바로 제보 때려주쇼!"
                    </div>
                </div>`,
                borderWidth: 0,
                disableAnchor: true,
                pixelOffset: new naver.maps.Point(0, -10)
            });

            naver.maps.Event.addListener(marker, "click", function() {
                if (currentInfoWindow) currentInfoWindow.close();
                infoWindow.open(map, marker);
                currentInfoWindow = infoWindow;
            });
        });
    } catch (e) {
        console.error("데이터 로딩 실패:", e);
    }
}

function 닫기제보창() {
    document.getElementById('report-modal').style.display = 'none';
    document.getElementById('modal-overlay').style.display = 'none';
    if (reportMarker) reportMarker.setMap(null);
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
    
    const submitBtn = document.getElementById('submit-btn');
    submitBtn.innerText = "전송 중...";
    submitBtn.disabled = true;

    try {
        await fetch(SCRIPT_URL, { method: 'POST', body: JSON.stringify(payload), mode: 'no-cors' });
        alert("🎉 제보 성공! 이제 구마적과 전국의 거지가 공유합니다.");
        location.reload();
    } catch (e) { 
        alert("전송 실패"); 
        submitBtn.innerText = "제보 완료하기";
        submitBtn.disabled = false;
    }
}