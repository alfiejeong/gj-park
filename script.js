// [보존] 전역 변수 및 설정
var map = null; 
var reportMarker = null; 
var selectedCoord = null;
var currentInfoWindow = null; 
var fetchedData = null; // 초고속 로딩을 위한 데이터 임시 저장소
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzQsFeRNYbSGxBQpiqnZFBNoLaDHE3bNkJuPukTEhcZeUWj4n1ayM_Q40qCuqUzXNFw/exec";

// [보존] 서비스 시작점
window.onload = function() {
    // 1. 저장된 닉네임 로드
    const savedNick = localStorage.getItem('gj-nick');
    if (savedNick) document.getElementById('user-nick').value = savedNick;

    // 2. [최적화] 지도를 그리기도 전에 데이터부터 원격 호출 (가장 먼저 실행)
    데이터불러오기();

    // 3. 위치 파악 및 지도 생성 프로세스 시작
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(success, error);
    } else {
        startMap(new naver.maps.LatLng(37.555145, 126.970590));
    }
};

// [보존] 위치 정보 수집 성공 시
function success(position) {
    const myLocation = new naver.maps.LatLng(position.coords.latitude, position.coords.longitude);
    startMap(myLocation);
}

// [보존] 위치 정보 수집 실패 시
function error() {
    console.warn("위치 권한 거부됨. 기본 위치로 시작합니다.");
    startMap(new naver.maps.LatLng(37.555145, 126.970590));
}

// [보존] 지도 객체 생성 및 초기화
function startMap(location) {
    map = new naver.maps.Map('map', {
        center: location,
        zoom: 16
    });

    // 지도가 준비되면 즉시 마커 표시 시도 (이미 데이터가 왔을 경우 대비)
    naver.maps.Event.once(map, 'init', function() {
        if (fetchedData) 마커표시실행();
    });

    // [편의성] 지도 클릭 시 열려있는 창 닫기 및 제보 마커 제거
    naver.maps.Event.addListener(map, 'click', function() {
        if (currentInfoWindow) { currentInfoWindow.close(); currentInfoWindow = null; }
        if (reportMarker) { reportMarker.setMap(null); reportMarker = null; }
    });
}

// [보존] 원격 서버(GAS)에서 데이터 수신
async function 데이터불러오기() {
    try {
        const response = await fetch(SCRIPT_URL + "?t=" + new Date().getTime());
        fetchedData = await response.json();
        console.log("데이터 수신 완료");
        
        // 지도가 이미 생성되어 있다면 즉시 마커 뿌리기
        if (map) 마커표시실행();
    } catch (e) {
        console.error("데이터 수신 실패:", e);
    }
}

// [신규/보강] 수신된 데이터를 실제 지도 위에 렌더링하는 핵심 함수
function 마커표시실행() {
    if (!fetchedData || !map) return;

    fetchedData.forEach(item => {
        // [undefined 방지] 다양한 키값에 대응하는 안전장치
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

        // [복구] 상세 정보창 레이아웃 및 구마적 한마디
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

        // 마커 클릭 시 정보창 열기
        naver.maps.Event.addListener(marker, "click", function(e) {
            if (currentInfoWindow) currentInfoWindow.close();
            infoWindow.open(map, marker);
            currentInfoWindow = infoWindow;
            if (e.domEvent) e.domEvent.stopPropagation(); 
        });
    });
    console.log("구마적 마커 렌더링 완료");
}

// [보존] 내 위치 버튼 기능
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

// [보존] 명당 제보 버튼 기능 (동적 노란 화살표 마커 적용)
function 제보하기() {
    alert("지도를 클릭하여 정확한 제보 위치를 선택해주세요.");
    
    const listener = naver.maps.Event.addListener(map, 'click', function(e) {
        if (reportMarker) reportMarker.setMap(null);
        
        selectedCoord = e.coord;
        reportMarker = new naver.maps.Marker({
            position: selectedCoord,
            map: map,
            icon: { 
                content: '<div class="reporting-pin">▼</div>', 
                anchor: new naver.maps.Point(20, 40) 
            }
        });

        // 주소 변환 및 모달 노출
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

// [보존] 제보창 닫기 및 초기화
function 닫기제보창() {
    document.getElementById('report-modal').style.display = 'none';
    document.getElementById('modal-overlay').style.display = 'none';
    if (reportMarker) {
        reportMarker.setMap(null);
        reportMarker = null;
    }
    selectedCoord = null;
    document.getElementById('place-addr').value = "";
    document.getElementById('place-name').value = "";
}

// [보존] 제보 데이터 서버 전송
async function 저장제보() {
    const user = document.getElementById('user-nick').value;
    const addr = document.getElementById('place-addr').value;
    const name = document.getElementById('place-name').value;
    const type = document.getElementById('parking-type').value;
    const