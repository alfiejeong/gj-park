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

// 지도 클릭 시 열려있는 정보창 닫기 및 제보 마커 제거
    naver.maps.Event.addListener(map, 'click', function() {
        if (currentInfoWindow) {
            currentInfoWindow.close();
            currentInfoWindow = null;
        }
        // [보완 3] 제보 도중 지도 클릭 시 임시 마커 제거
        if (reportMarker) {
            reportMarker.setMap(null);
            reportMarker = null;
        }
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

// [보완 4] 명당 제보 클릭 시: 노란 화살표가 위아래로 다이내믹하게 움직임
function 제보하기() {
    alert("지도를 클릭하여 정확한 제보 위치를 선택해주세요.");
    
    // 기존에 남아있을지 모르는 리스너 제거 후 새로 등록
    naver.maps.Event.clearListeners(map, 'click');
    
    const listener = naver.maps.Event.addListener(map, 'click', function(e) {
        if (reportMarker) reportMarker.setMap(null);
        
        selectedCoord = e.coord;
        reportMarker = new naver.maps.Marker({
            position: selectedCoord,
            map: map,
            // 제보 시에만 다이내믹한 노란 화살표 아이콘 사용
            icon: { 
                content: '<div class="reporting-pin">▼</div>', 
                anchor: new naver.maps.Point(20, 40) 
            }
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

// [보완 1] 이미 저장된 데이터: 정적인 화이트+옐로우 라벨로 표시
async function 데이터불러오기() {
    try {
        const response = await fetch(SCRIPT_URL + "?t=" + new Date().getTime());
        const data = await response.json();

        data.forEach(item => {
            const marker = new naver.maps.Marker({
                position: new naver.maps.LatLng(item.lat, item.lng), 
                map: map,
                icon: { 
                    content: `<div class="parking-label">${item.type}</div>`, 
                    anchor: new naver.maps.Point(20, 10) 
                }
            });

            // (정보창 로직은 기존 유지...)
            const infoWindow = new naver.maps.InfoWindow({
                content: `...기존 상세정보 HTML...`,
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
    } catch (e) { console.error(e); }
}

// [보완 3] 제보창 닫기/취소 시 마커 및 좌표 완전 초기화
function 닫기제보창() {
    document.getElementById('report-modal').style.display = 'none';
    document.getElementById('modal-overlay').style.display = 'none';
    
    // 마커 제거 및 메모리 정리
    if (reportMarker) {
        reportMarker.setMap(null);
        reportMarker = null;
    }
    selectedCoord = null;
    
    // 입력 필드 초기화 (다음 제보를 위해)
    document.getElementById('place-addr').value = "";
    document.getElementById('place-name').value = "";
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