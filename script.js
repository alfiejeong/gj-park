var map = null;
var currentInfo = null;
var pickMarker = null;
var addrStr = "";
var preloadedData = [];
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzjjKRbsdD7GKqj4J8n5gkO-7kIHosq5-0mOdiPsycnxpMJMYMEPzrAolCIHVJb_qyL/exec";

// 데이터 즉시 호출 (병렬 로딩)
(function preFetch() {
    [`${SCRIPT_URL}?type=sheet&t=${new Date().getTime()}`, `${SCRIPT_URL}?type=seoul&t=${new Date().getTime()}`].forEach(url => {
        fetch(url).then(r => r.json()).then(d => {
            preloadedData.push(...d);
            if (map) renderAllMarkers();
        }).catch(e => console.log("데이터 대기..."));
    });
})();

function initMap() {
    // 위치 정보를 먼저 가져오고 지도를 띄움 (시청역 경유 방지)
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
    });

    if (preloadedData.length > 0) renderAllMarkers();
    
    const oldNick = localStorage.getItem('gj-nick');
    if (oldNick) document.getElementById('nick').value = oldNick;

    setupEvents();
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