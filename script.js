var map = null;
var currentInfo = null;
var pickMarker = null;
var addrStr = "";
var preloadedData = []; // 데이터를 미리 담아둘 바구니
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzjjKRbsdD7GKqj4J8n5gkO-7kIHosq5-0mOdiPsycnxpMJMYMEPzrAolCIHVJb_qyL/exec";

// [핵심] 지도가 뜨기 전, 파일이 읽히자마자 데이터 취재부터 나갑니다.
(function preFetch() {
    console.log("0초: 데이터 수급 개시");
    const urls = [`${SCRIPT_URL}?type=sheet`, `${SCRIPT_URL}?type=seoul`];
    urls.forEach(url => {
        fetch(url).then(r => r.json()).then(d => {
            preloadedData.push(...d);
            if (map) renderAllMarkers(); // 지도가 이미 떠 있다면 즉시 투하
        });
    });
})();

function initMap() {
    console.log("1초: 지도 엔진 점화");
    // [개선] 시청역을 거치지 않기 위해 브라우저의 마지막 위치나 기본값을 즉시 활용
    navigator.geolocation.getCurrentPosition((pos) => {
        startMap(pos.coords.latitude, pos.coords.longitude);
    }, () => {
        startMap(37.5665, 126.9780); // 거부 시에만 서울시청
    }, { enableHighAccuracy: true, timeout: 2000 }); // 대기 시간 단축
}

function startMap(lat, lng) {
    const coords = new naver.maps.LatLng(lat, lng);
    map = new naver.maps.Map('map', {
        center: coords,
        zoom: 15,
        background: '#FFD400'
    });

    // 지도가 생성되자마자 이미 받아온 데이터가 있다면 바로 뿌립니다.
    if (preloadedData.length > 0) renderAllMarkers();
    
    setupEvents();
    
    // 닉네임 복구
    const oldNick = localStorage.getItem('gj-nick');
    if (oldNick) document.getElementById('nick').value = oldNick;
}

function renderAllMarkers() {
    preloadedData.forEach(item => {
        // 이미 그려진 마커인지 체크하는 로직 (중복 방지)
        if (!item.rendered) {
            renderMarker(item, item.user === "서울시" ? "서울" : "제보");
            item.rendered = true;
        }
    });
}

function renderMarker(item, src) {
    if (!item.lat || !item.lng) return;
    const marker = new naver.maps.Marker({
        position: new naver.maps.LatLng(item.lat, item.lng),
        map: map,
        icon: { content: `<div class="label-saved">${item.type}</div>`, anchor: new naver.maps.Point(30, 15) }
    });

    naver.maps.Event.addListener(marker, 'click', () => {
        if (currentInfo) currentInfo.close();
        const info = new naver.maps.InfoWindow({
            content: `<div style="padding:15px; font-size:13px; line-height:1.5;"><b>${item.name}</b><br><small>${item.address}</small><br><hr style="border:0;border-top:1px solid #eee;"><small>${item.desc || '정보 없음'}</small></div>`,
            borderWidth: 0, disableAnchor: true
        });
        info.open(map, marker);
        currentInfo = info;
    });
}

// ... (setupEvents, openModal, closeModal, submitReport, moveToMyLoc 함수 유지)

window.onload = initMap;