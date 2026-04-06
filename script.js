var map = null;
var currentInfo = null;
var pickMarker = null;
var addrStr = "";
var preloadedData = []; // 데이터를 미리 담아둘 저장소
var isDataLoaded = false; // 데이터 로드 완료 여부 체크

// [핵심] 지도를 그리기 전, 파일이 로드되자마자 0초 시점에 데이터부터 부릅니다.
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycby_-yBAmh2rNKo4wSea9dcLMygUdmPbiiuedxZatJAwaaib1g-PNLrOBYw17YORob5Y/exec";

(function preFetchData() {
    console.log("0초: 데이터 수급 즉시 개시");
    const urls = [`${SCRIPT_URL}?type=sheet&t=${new Date().getTime()}`, `${SCRIPT_URL}?type=seoul&t=${new Date().getTime()}`];
    
    Promise.all(urls.map(url => fetch(url).then(r => r.json())))
    .then(results => {
        results.forEach(d => preloadedData.push(...d));
        isDataLoaded = true;
        console.log("데이터 준비 완료");
        // 만약 지도가 이미 생성되어 있다면 바로 마커를 뿌립니다.
        if (map) renderAllMarkers();
    })
    .catch(e => console.log("데이터 대기 중..."));
})();

function initMap() {
    // 시청역을 들르지 않기 위해 위치 정보 획득 후 지도를 생성합니다.
    navigator.geolocation.getCurrentPosition((pos) => {
        setupMap(pos.coords.latitude, pos.coords.longitude);
    }, () => {
        setupMap(37.5665, 126.9780); // 거부 시 서울시청
    }, { timeout: 3000 });
}

function setupMap(lat, lng) {
    map = new naver.maps.Map('map', {
        center: new naver.maps.LatLng(lat, lng),
        zoom: 15,
        background: '#FFD400'
    });

    // 지도가 완전히 그려지면 로딩 화면 제거
    naver.maps.Event.addListener(map, 'tilesloaded', function() {
        const screen = document.getElementById('loading-screen');
        if (screen) {
            screen.style.opacity = '0';
            setTimeout(() => { screen.style.display = 'none'; }, 500);
        }
        // 지도가 뜬 시점에 데이터가 이미 와 있다면 즉시 렌더링
        if (isDataLoaded) renderAllMarkers();
    });

    const oldNick = localStorage.getItem('gj-nick');
    if (oldNick) {
        const nickEl = document.getElementById('nick');
        if (nickEl) nickEl.value = oldNick;
    }

    setupEvents();
}

function renderAllMarkers() {
    preloadedData.forEach(item => {
        if (!item.isRendered) {
            const marker = new naver.maps.Marker({
                position: new naver.maps.LatLng(item.lat, item.lng),
                map: map,
                icon: { content: `<div class="label-saved">${item.type}</div>`, anchor: new naver.maps.Point(30, 15) }
            });
            naver.maps.Event.addListener(marker, 'click', () => {
                if (currentInfo) currentInfo.close();
                const info = new naver.maps.InfoWindow({
                    content: `<div style="padding:15px; font-size:13px; line-height:1.5;"><b>${item.name}</b><br><small>${item.address}</small><br><hr style="border:0;border-top:1px solid #eee;"><small>${item.desc || '정보없음'}</small></div>`,
                    borderWidth: 0, disableAnchor: true
                });
                info.open(map, marker);
                currentInfo = info;
            });
            item.isRendered = true;
        }
    });
}

function setupEvents() {
    naver.maps.Event.addListener(map, 'click', (e) => {
        if (currentInfo) currentInfo.close();
        if (pickMarker) pickMarker.setMap(null);
        pickMarker = new naver.maps.Marker({
            position: e.coord, map: map,
            icon: { content: '<div class="report-marker"></div>', anchor: new naver.maps.Point(12, 24) }
        });
        naver.maps.Service.reverseGeocode({ coords: e.coord }, (status, res) => {
            if (status === naver.maps.Service.Status.OK) {
                addrStr = res.v2.address.jibunAddress || res.v2.address.roadAddress;
            }
        });
    });
}

function openModal() {
    if (!pickMarker) return alert("지도에 위치를 먼저 찍어주세요!");
    const addrEl = document.getElementById('addr-text');
    if (addrEl) addrEl.innerText = "📍 " + (addrStr || "주소 확인 중...");
    document.getElementById('modal').classList.remove('hidden');
}

function closeModal() { document.getElementById('modal').classList.add('hidden'); }

async function submitReport() {
    const nick = document.getElementById('nick').value;
    const name = document.getElementById('pname').value;
    const type = document.getElementById('ptype').value;
    const desc = document.getElementById('pdesc').value;
    if (!nick || !name) return alert("닉네임과 장소명을 적어주세요!");
    localStorage.setItem('gj-nick', nick);
    const q = new URLSearchParams({ user: nick, name: name, type: type, addr: addrStr, desc: desc, lat: pickMarker.getPosition().lat(), lng: pickMarker.getPosition().lng() });
    
    await fetch(`${SCRIPT_URL}?${q.toString()}`, { mode: 'no-cors' });
    alert("제보 완료!"); location.reload();
}

function moveToMyLoc() {
    navigator.geolocation.getCurrentPosition((pos) => {
        if (map) map.panTo(new naver.maps.LatLng(pos.coords.latitude, pos.coords.longitude));
    });
}

window.onload = initMap;