// [보존] 전역 변수 유지
var mainMap = null, reportMarker = null, selectedCoord = null;
var currentInfoWindow = null; 
var fetchedData = null; 
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzjjKRbsdD7GKqj4J8n5gkO-7kIHosq5-0mOdiPsycnxpMJMYMEPzrAolCIHVJb_qyL/exec";

window.onload = function() {
    // 1. 데이터 선제 로드 (캐시)
    const cachedData = localStorage.getItem('gj-cache');
    if (cachedData) { fetchedData = JSON.parse(cachedData); }
    // 2. 백그라운드 데이터 호출
    데이터불러오기();

    // 3. 지도 초기 생성 (서울 시청 기본값)
    var defaultCenter = new naver.maps.LatLng(37.5665, 126.9780); 
    mainMap = new naver.maps.Map('map', {
        center: defaultCenter,
        zoom: 16,
        logoControl: false
    });

    // 4. [보완] 지도가 뜨자마자 즉시 제보 마커를 화면 중앙에 생성 (0초 노출)
    생성제보마커(defaultCenter);

    // 5. 캐시 마커 표시
    if (fetchedData) 마커표시실행();
// 6. 내 위치 찾기 및 마커 이동
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(function(pos) {
            var myLoc = new naver.maps.LatLng(pos.coords.latitude, pos.coords.longitude);
            if(mainMap) {
                mainMap.setCenter(myLoc);
                if (reportMarker) reportMarker.setPosition(myLoc); // 내 위치로 핀 이동
                selectedCoord = myLoc;
            }


        });
    }const savedNick = localStorage.getItem('gj-nick');
    if(savedNick) document.getElementById('user-nick').value = savedNick;

    // 7. [로직 수정] 지도 클릭 시: "정보창 닫기" 및 "핀 이동"만 수행 (입력창 열지 않음)
    naver.maps.Event.addListener(mainMap, 'click', function(e) {
        if (currentInfoWindow) {
            currentInfoWindow.close();
            currentInfoWindow = null;
        }
        
        // 클릭한 곳으로 제보 핀 이동
        selectedCoord = e.coord;
        if (reportMarker) {
            reportMarker.setPosition(selectedCoord);
        } else {
            생성제보마커(selectedCoord);
        }
    });
};

// [신규/보강] 블랙&옐로우 역물방울 마커 생성 함수
function 생성제보마커(coord) {
    if (reportMarker) reportMarker.setMap(null);
    selectedCoord = coord;
    reportMarker = new naver.maps.Marker({
        position: coord,
        map: mainMap,
        icon: { 
            // CSS에서 정의한 gj-pin 클래스 사용 (블랙 테두리, 노랑 속, 역물방울)
            content: '<div class="gj-pin"></div>', 
            anchor: new naver.maps.Point(17, 35) 
        }
    });

    // [보존] 내위치찾기 함수
function 내위치찾기() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(function(pos) {
            const curr = new naver.maps.LatLng(pos.coords.latitude, pos.coords.longitude);
            mainMap.setCenter(curr);
            mainMap.setZoom(17);
            if (reportMarker) reportMarker.setPosition(curr);
            selectedCoord = curr;
        });
    }
}

// [로직 수정] 명당 제보 버튼 클릭 시: 그제서야 주소를 찾고 입력창을 띄움
function 제보하기() {
    if (!selectedCoord) {
        alert("지도를 클릭하여 제보 위치를 먼저 선택해주세요.");
        return;
    }

    // 현재 마커가 찍힌 위치의 주소를 가져옴
    naver.maps.Service.reverseGeocode({ coords: selectedCoord }, function(status, response) {
        if (status === naver.maps.Service.Status.OK) {
            const finalAddr = response.v2.address.jibunAddress || response.v2.address.roadAddress;
            document.getElementById('place-addr').value = finalAddr || "";
            
            // 버튼을 눌렀을 때만 모달창 노출
            document.getElementById('report-modal').style.display = 'block';
            document.getElementById('modal-overlay').style.display = 'block';
        } else {
            alert("주소를 확인할 수 없는 지역입니다. 다시 시도해 주세요.");
        }
    });
}

// [기존 유지] 데이터불러오기, 마커표시실행, 닫기제보창, 저장제보 함수...
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
            position: new naver.maps.LatLng(item.lat, item.lng), 
            map: mainMap,
            icon: { content: `<div class="parking-label">${item.type}</div>`, anchor: new naver.maps.Point(20, 10) }
        });
        const infoWindow = new naver.maps.InfoWindow({
            content: `<div style="padding:15px; min-width:200px; line-height:1.5; background-color: #fff; border: 3px solid #FFD400; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
                <h4 style="margin:0; color:#FF5252; font-size:16px;">📍 ${item.name || '무명'}</h4>
                <div style="font-size:12px; color:#666; margin-bottom:5px;">${item.address || '주소 불명'}</div>
                <div style="font-size:13px; margin-top:5px; color:#333;"><b>유형:</b> ${item.type} (${item.capacity || 0}면)</div>
                <div style="font-size:12px; background:#f9f9f9; padding:8px; margin-top:8px; border-radius:6px; color:#555; border-left:3px solid #FFD400;">${item.note || '꿀팁 준비 중'}</div>
                <div style="font-size:11px; color:#999; margin-top:8px; text-align:right;">제보자: ${item.user || '익명'}</div>
                 });
}