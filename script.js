var map = null;
var currentInfo = null;
var pickMarker = null;
var addrStr = "";
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyFtF9Qvwmj_fNmDvm1-GVMSrhU7xteNSCes0evTFp4j1NLVnm28V3QmQlN2UlhjXEo/exec";

function initMap() {
    // [1] 내 위치 탐색 시작
    navigator.geolocation.getCurrentPosition((pos) => {
        const coords = new naver.maps.LatLng(pos.coords.latitude, pos.coords.longitude);
        map = new naver.maps.Map('map', { center: coords, zoom: 15 });
        setupEvents();
    }, () => {
        map = new naver.maps.Map('map', { center: new naver.maps.LatLng(37.5665, 126.9780), zoom: 13 });
        setupEvents();
    });

    // 닉네임 기억
    const oldNick = localStorage.getItem('gj-nick');
    if (oldNick) document.getElementById('nick').value = oldNick;
}

function setupEvents() {
    // 지도 클릭 시 초기화 및 마커 이동
    naver.maps.Event.addListener(map, 'click', (e) => {
        if (currentInfo) currentInfo.close();
        if (pickMarker) pickMarker.setMap(null);

        pickMarker = new naver.maps.Marker({
            position: e.coord, map: map,
            icon: { content: '<div class="report-marker"></div>', anchor: new naver.maps.Point(15, 30) }
        });

        // 네이버 Geocoding 서비스로 주소 획득
        naver.maps.Service.reverseGeocode({ coords: e.coord }, (status, res) => {
            if (status === naver.maps.Service.Status.OK) {
                addrStr = res.v2.address.jibunAddress || res.v2.address.roadAddress;
            }
        });
    });
    fetchData(); // 데이터 로드
}

function fetchData() {
    fetch(`${SCRIPT_URL}?type=sheet`).then(r => r.json()).then(d => d.forEach(i => renderMarker(i, "제보")));
    fetch(`${SCRIPT_URL}?type=seoul`).then(r => r.json()).then(d => d.forEach(i => renderMarker(i, "서울")));
}

function renderMarker(item, src) {
    if (!item.lat || !item.lng) return;
    const marker = new naver.maps.Marker({
        position: new naver.maps.LatLng(item.lat, item.lng),
        map: map,
        icon: { content: `<div class="label-saved">${item.type}</div>`, anchor: new naver.maps.Point(30, 15) }
    });

    const info = new naver.maps.InfoWindow({
        content: `<div style="padding:12px; font-size:13px; line-height:1.4;"><b>${item.name}</b><br>${item.address}<br><hr><small>${item.desc || '상세내용 없음'}</small><br><small style="color:#999">제보자: ${item.user}</small></div>`,
        borderWidth: 0, disableAnchor: true
    });

    naver.maps.Event.addListener(marker, 'click', () => {
        if (currentInfo) currentInfo.close();
        info.open(map, marker);
        currentInfo = info;
    });
}

function openModal() {
    if (!pickMarker) return alert("지도에 마커를 먼저 찍어주세요!");
    document.getElementById('addr-preview').innerText = "📍 " + (addrStr || "주소를 확인 중...");
    document.getElementById('modal').classList.remove('hidden');
}

function closeModal() { document.getElementById('modal').classList.add('hidden'); }

async function submitReport() {
    const nick = document.getElementById('nick').value;
    const name = document.getElementById('pname').value;
    const type = document.getElementById('ptype').value;
    const desc = document.getElementById('pdesc').value;

    if (!nick || !name) return alert("닉네임과 장소명을 입력하세요.");
    localStorage.setItem('gj-nick', nick);

    const q = new URLSearchParams({
        user: nick, name: name, type: type, addr: addrStr, desc: desc,
        lat: pickMarker.getPosition().lat(), lng: pickMarker.getPosition().lng()
    });

    await fetch(`${SCRIPT_URL}?${q.toString()}`);
    alert("명당 제보가 완료되었습니다!"); location.reload();
}

function moveToMyLoc() {
    navigator.geolocation.getCurrentPosition((pos) => {
        map.panTo(new naver.maps.LatLng(pos.coords.latitude, pos.coords.longitude));
    });
}

window.onload = initMap;