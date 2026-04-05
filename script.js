var map = null; 
var reportMarker = null; 
var selectedCoord = null;
var currentInfoWindow = null; 
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzQsFeRNYbSGxBQpiqnZFBNoLaDHE3bNkJuPukTEhcZeUWj4n1ayM_Q40qCuqUzXNFw/exec";

window.onload = function() {
    // 1. 닉네임 불러오기
    const savedNick = localStorage.getItem('gj-nick');
    if (savedNick) document.getElementById('user-nick').value = savedNick;

    // [핵심 최적화] 지도가 그려지길 기다리지 않고 바로 데이터부터 호출 시작!
    데이터불러오기();

    // 2. 위치 파악 및 지도 생성 시작 (데이터 호출과 동시에 진행됨)
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
    // 이미 데이터 호출은 위에서 시작된 상태입니다.
    map = new naver.maps.Map('map', {
        center: location,
        zoom: 16
    });

    // 지도 클릭 시 초기화 로직 (기존 유지)
    naver.maps.Event.addListener(map, 'click', function() {
        if (currentInfoWindow) {
            currentInfoWindow.close();
            currentInfoWindow = null;
        }
        if (reportMarker) {
            reportMarker.setMap(null);
            reportMarker = null;
        }
    });
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

// 데이터불러오기 함수는 기존 코드를 유지하되, 
// map 객체가 생성되었는지 확인하는 안전장치만 살짝 추가합니다.
async function 데이터불러오기() {
    try {
        // [속도 개선] 캐시 방지를 위해 현재 시간을 붙여 호출
        const response = await fetch(SCRIPT_URL + "?t=" + new Date().getTime());
        const data = await response.json();

        console.log("수신 데이터 확인:", data); // 개발자 도구(F12)에서 실제 키값을 확인하기 위함

        // 지도가 생성될 때까지 대기하는 로직 최적화
        const checkMap = setInterval(() => {
            if (map) {
                clearInterval(checkMap);
                
                data.forEach(item => {
                    // [데이터 매핑 개선] 시트 헤더가 address, addr, 주소 중 무엇이든 대응합니다.
                    const finalAddr = item.address || item.addr || item.주소 || "주소 정보 없음";
                    const userName = item.user || item.username || item.제보자 || "익명";
                    const placeName = item.name || item.title || item.장소명 || "무명 장소";

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
                            <h4 style="margin:0; color:#FF5252; font-size:16px;">📍 ${placeName}</h4>
                            <div style="font-size:12px; color:#666; margin-bottom:5px;">${finalAddr}</div>
                            <div style="font-size:13px; margin-top:5px; color:#333;">
                                <b>유형:</b> <span style="color:#000;">${item.type || '일반'}</span> (${item.capacity || 0}면)
                            </div>
                            <div style="font-size:12px; background:#f9f9f9; padding:8px; margin-top:8px; border-radius:6px; color:#555; border-left:3px solid #FFD400;">
                                ${item.note || '꿀팁 준비 중'}
                            </div>
                            <div style="font-size:11px; color:#999; margin-top:8px; text-align:right;">제보자: ${userName}</div>
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
                console.log("구마적 마커 배치 완료");
            }
        }, 50); // 체크 간격을 더 좁혀서(0.05초) 속도 향상
    } catch (e) { 
        console.error("데이터 로딩 실패:", e); 
    }
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