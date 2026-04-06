var map = null;
var currentInfo = null;
var pickMarker = null;
var addrStr = "";
// [핵심] 반드시 GAS '새 배포' 후 생성된 URL을 여기에 넣으십시오.
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxWc1uZUkRAUu3pn3v_R2AzqfGcGNkYJ19GtZ6J8KXVIVB0l8u68k4b7Wfjltttf-Ll/exec";

function initMap() {
    navigator.geolocation.getCurrentPosition((pos) => {
        const coords = new naver.maps.LatLng(pos.coords.latitude, pos.coords.longitude);
        map = new naver.maps.Map('map', { center: coords, zoom: 15 });
        setupEvents();
    }, () => {
        map = new naver.maps.Map('map', { center: new naver.maps.LatLng(37.5665, 126.9780), zoom: 13 });
        setupEvents();
    });

    const oldNick = localStorage.getItem('gj-nick');
    if (oldNick) document.getElementById('nick').value = oldNick;
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
    fetchData(); 
}

function fetchData() {
    // 3초 딜레이 없이 병렬 로드
    fetch(`${SCRIPT_URL}?type=sheet`).then(r => r.json()).then(d => d.forEach(i => renderMarker(i, "제보"))).catch(e => {});
    fetch(`${SCRIPT_URL}?type=seoul`).then(r => r.json()).then(d => d.forEach(i => renderMarker(i, "서울"))).catch(e => {});
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

function openModal() {
    if (!pickMarker) return alert("지도에 위치를 먼저 찍어주세요!");
    document.getElementById('addr-text').innerText = "📍 " + (addrStr || "주소를 찾는 중...");
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
    
    // CORS 문제를 피하기 위해 redirect 허용 모드로 호출
    await fetch(`${SCRIPT_URL}?${q.toString()}`, { mode: 'no-cors' });
    alert("제보가 완료되었습니다!"); location.reload();
}

function moveToMyLoc() {
    navigator.geolocation.getCurrentPosition((pos) => {
        map.panTo(new naver.maps.LatLng(pos.coords.latitude, pos.coords.longitude));
    });
}

window.onload = initMap;