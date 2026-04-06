var map = null;
var currentInfo = null;
var pickMarker = null;
var addrStr = "";
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzjjKRbsdD7GKqj4J8n5gkO-7kIHosq5-0mOdiPsycnxpMJMYMEPzrAolCIHVJb_qyL/exec";

function initMap() {
    // [개선 1] 데이터 수급을 지도 생성보다 '먼저' 혹은 '동시에' 시작합니다.
    fetchData(); 

    // [개선 2] 지도 생성 로직
    navigator.geolocation.getCurrentPosition((pos) => {
        const coords = new naver.maps.LatLng(pos.coords.latitude, pos.coords.longitude);
        map = new naver.maps.Map('map', { 
            center: coords, 
            zoom: 15,
            // 배경 검은색 깜빡임 방지용 로직
            background: '#eee' 
        });
        setupEvents();
    }, () => {
        map = new naver.maps.Map('map', { center: new naver.maps.LatLng(37.5665, 126.9780), zoom: 13, background: '#eee' });
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
    // fetchData() 위치를 위로 올렸으므로 여기서 중복 호출하지 않습니다.
}

function fetchData() {
    // [개선 3] await를 제거하여 두 데이터를 동시에, 즉시 요청합니다.
    // 지도 객체(map)가 생성되기 전이라도 데이터를 미리 받아 메모리에 올립니다.
    
    fetch(`${SCRIPT_URL}?type=sheet&t=${new Date().getTime()}`)
        .then(r => r.json())
        .then(d => {
            console.log("시트 데이터 도착");
            checkMapAndRender(d, "제보");
        }).catch(e => {});

    fetch(`${SCRIPT_URL}?type=seoul&t=${new Date().getTime()}`)
        .then(r => r.json())
        .then(d => {
            console.log("서울 데이터 도착");
            checkMapAndRender(d, "서울");
        }).catch(e => {});
}

// [개선 4] 지도가 아직 안 떴을 경우를 대비한 안전 장치
function checkMapAndRender(data, src) {
    if (map) {
        data.forEach(i => renderMarker(i, src));
    } else {
        // 지도가 뜰 때까지 0.1초마다 체크하여 바로 뿌립니다.
        const timer = setInterval(() => {
            if (map) {
                data.forEach(i => renderMarker(i, src));
                clearInterval(timer);
            }
        }, 100);
    }
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

// ... (openModal, closeModal, submitReport, moveToMyLoc 함수는 기존과 동일하게 유지)

window.onload = initMap;