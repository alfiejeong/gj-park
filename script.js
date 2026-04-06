var mainMap = null;
var currentInfoWindow = null;
var selectedMarker = null; // 제보용 임시 마커
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzw-LgUF6fGer-TjJnhyhI6jobr3kKpDrD7nFPxQy5bN_ajy90FWQFOWZsOjvvarIMt/exec";

function initMap() {
    // 1. 지도 즉시 렌더링 (딜레이 제거)
    mainMap = new naver.maps.Map('map', {
        center: new naver.maps.LatLng(37.5665, 126.9780),
        zoom: 12
    });

    // 2. 닉네임 자동 완성
    const savedNick = localStorage.getItem('gj-nickname');
    if (savedNick) document.getElementById('user-nick').value = savedNick;

    // 3. 지도 클릭 시 초기화 및 위치 지정
    naver.maps.Event.addListener(mainMap, 'click', function(e) {
        if (currentInfoWindow) currentInfoWindow.close();
        if (selectedMarker) selectedMarker.setMap(null);

        // 제보 위치 표시 (임시 마커)
        selectedMarker = new naver.maps.Marker({
            position: e.coord,
            map: mainMap,
            icon: { content: '<div style="width:10px;height:10px;background:red;border-radius:50%;"></div>', anchor: new naver.maps.Point(5, 5) }
        });
    });

    // 4. 데이터 즉시 호출 (3초 대기 없음)
    데이터수급();
}

function 데이터수급() {
    // 구글 시트 데이터 로드
    fetch(`${SCRIPT_URL}?type=sheet`).then(r => r.json()).then(data => {
        data.forEach(item => 마커식재(item, "제보"));
    });

    // 서울시 데이터 로드
    fetch(`${SCRIPT_URL}?type=seoul`).then(r => r.json()).then(data => {
        data.forEach(item => 마커식재(item, "서울시"));
    });
}

function 마커식재(item, source) {
    if (!item.lat || !item.lng) return;

    const marker = new naver.maps.Marker({
        position: new naver.maps.LatLng(item.lat, item.lng),
        map: mainMap,
        icon: {
            content: `<div class="marker-drop ${source === '서울시' ? 'seoul' : ''}"><span>${item.type.substring(0,2)}</span></div>`,
            anchor: new naver.maps.Point(17, 34)
        }
    });

    const info = new naver.maps.InfoWindow({
        content: `<div style="padding:10px; font-size:13px;"><b>${item.name}</b><br>${item.address}<br><small>작성자: ${item.user}</small></div>`,
        borderWidth: 0, disableAnchor: true
    });

    naver.maps.Event.addListener(marker, 'click', () => {
        if (currentInfoWindow) currentInfoWindow.close();
        info.open(mainMap, marker);
        currentInfoWindow = info;
    });
}

async function 제보하기() {
    const nick = document.getElementById('user-nick').value;
    const name = document.getElementById('parking-name').value;
    const type = document.getElementById('parking-type').value;

    if (!selectedMarker || !name || !nick) return alert("지도 클릭 후 모든 정보를 입력하세요!");

    // 닉네임 로컬 저장
    localStorage.setItem('gj-nickname', nick);

    const query = new URLSearchParams({
        user: nick, name: name, type: type,
        lat: selectedMarker.getPosition().lat(),
        lng: selectedMarker.getPosition().lng()
    });

    const res = await fetch(`${SCRIPT_URL}?${query.toString()}`);
    if (res.ok) { alert("성공적으로 제보되었습니다!"); location.reload(); }
}

window.onload = initMap;