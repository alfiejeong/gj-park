var map = null;
var currentInfo = null;
var pickMarker = null;
var addrStr = "";
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzjjKRbsdD7GKqj4J8n5gkO-7kIHosq5-0mOdiPsycnxpMJMYMEPzrAolCIHVJb_qyL/exec";

// [1] 지도 초기화 함수
function initMap() {
    const defaultCoords = new naver.maps.LatLng(37.5665, 126.9780);
    map = new naver.maps.Map('map', {
        center: defaultCoords,
        zoom: 14,
        background: '#FFD400'
    });

    // 내 위치 추적 (지도는 이미 뜬 상태에서 백그라운드 실행)
    navigator.geolocation.getCurrentPosition((pos) => {
        const myLoc = new naver.maps.LatLng(pos.coords.latitude, pos.coords.longitude);
        map.panTo(myLoc);
    });

    // 닉네임 복구
    const oldNick = localStorage.getItem('gj-nick');
    if (oldNick) document.getElementById('nick').value = oldNick;

    setupEvents();
    fetchData();
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

// [2] 제보 모달 관련 함수 (에러 해결 지점)
function openModal() {
    if (!pickMarker) return alert("지도에 위치를 먼저 찍어주세요!");
    const addrEl = document.getElementById('addr-text');
    if (addrEl) addrEl.innerText = "📍 " + (addrStr || "주소 확인 중...");
    document.getElementById('modal').classList.remove('hidden');
}

function closeModal() {
    document.getElementById('modal').classList.add('hidden');
}

// [3] 데이터 및 기타 기능
function fetchData() {
    fetch(`${SCRIPT_URL}?type=sheet&t=${new Date().getTime()}`).then(r => r.json()).then(d => d.forEach(i => renderMarker(i, "제보"))).catch(e => {});
    fetch(`${SCRIPT_URL}?type=seoul&t=${new Date().getTime()}`).then(r => r.json()).then(d => d.forEach(i => renderMarker(i, "서울"))).catch(e => {});
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
            content: `<div style="padding:15px; font-size:13px; line-height:1.5;"><b>${item.name}</b><br><small>${item.address}</small></div>`,
            borderWidth: 0, disableAnchor: true
        });
        info.open(map, marker);
        currentInfo = info;
    });
}

async function submitReport() {
    const nick = document.getElementById('nick').value;
    const name = document.getElementById('pname').value;
    const type = document.getElementById('ptype').value;
    const desc = document.getElementById('pdesc').value;
    if (!nick || !name) return alert("닉네임과 장소명을 적어주세요!");
    localStorage.setItem('gj-nick', nick);
    const q = new URLSearchParams({ user: nick, name: name, type: type, addr: addrStr, desc: desc, lat: pickMarker.getPosition().lat(), lng: pickMarker.getPosition().lng() });
    await fetch(`${SCRIPT_URL}?${q.toString()}`, { mode: 'no-cors' });
    alert("제보가 완료되었습니다!"); location.reload();
}

function moveToMyLoc() {
    navigator.geolocation.getCurrentPosition((pos) => {
        if (map) map.panTo(new naver.maps.LatLng(pos.coords.latitude, pos.coords.longitude));
    });
}