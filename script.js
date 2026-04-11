/**
 * 거지주차.com 통합 스크립트
 * [수정내역] 중복 선언 방지, 이미지 경로 자동 보정, 댓글 후 상세페이지 유지
 */

var map = null;
var currentInfo = null;
var pickMarker = null;
var addrStr = "";
var preloadedData = []; 
var isDataLoaded = false; 
var boardData = [];

// [주의] 이 변수가 파일 내에 딱 하나만 있는지 반드시 확인하십시오.
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyI50yKu4DzhElmU87lE2W3awdrGd9ZtX2no2opBs_no43o1oOuJORl68JS6xe8RNa2/exec";

// [보정] 수다방 데이터까지 포함한 통합 수급 로직
function preFetchData() {
    console.log("🚀 지능형 통합 데이터 수급 시작...");
    const urls = [
        `${SCRIPT_URL}?type=sheet&t=${new Date().getTime()}`,
        `${SCRIPT_URL}?type=seoul&t=${new Date().getTime()}`,
        `${SCRIPT_URL}?type=get_board&t=${new Date().getTime()}`
    ];
    
    Promise.all(urls.map(url => 
        fetch(url, {
            method: 'GET',
            // 구글 서버의 302 리다이렉트를 끝까지 추적하게 합니다.
            redirect: 'follow' 
        })
        .then(r => r.json())
        .catch(e => {
            console.error("단일 데이터 로드 실패:", e);
            return [];
        })
    ))
    .then(results => {
        preloadedData = [];
        if (Array.isArray(results[0])) preloadedData.push(...results[0]);
        if (Array.isArray(results[1])) preloadedData.push(...results[1]);
        
        // 미리 가져온 게시판 데이터 저장
        boardData = Array.isArray(results[2]) ? results[2] : [];
        
        isDataLoaded = true;
        console.log("✅ 광속 수급 완료. 지도 데이터:", preloadedData.length, "건 / 수다방:", boardData.length, "건");
        
        if (map) renderAllMarkers();
    });
}

// [2] 지도 설정
function initMap() {
    if (typeof naver === 'undefined') return setTimeout(initMap, 100);
    navigator.geolocation.getCurrentPosition((pos) => {
        setupMap(pos.coords.latitude, pos.coords.longitude);
    }, () => {
        setupMap(37.5665, 126.9780); 
    }, { timeout: 3000 });
}

function setupMap(lat, lng) {
    map = new naver.maps.Map('map', { center: new naver.maps.LatLng(lat, lng), zoom: 15, background: '#FFD400' });
    naver.maps.Event.addListener(map, 'tilesloaded', function() {
        const screen = document.getElementById('loading-screen');
        if (screen) {
            screen.style.opacity = '0';
            setTimeout(() => { screen.style.display = 'none'; }, 500);
        }
        if (isDataLoaded) renderAllMarkers();
    });
    const oldNick = localStorage.getItem('gj-nick');
    if (oldNick) {
        const nickEl = document.getElementById('nick');
        if (nickEl) nickEl.value = oldNick;
    }
    setupEvents();
}

// [3] 마커 렌더링
function renderAllMarkers() {
    if (!map) return;
    preloadedData.forEach(item => {
        const lat = Number(item.lat);
        const lng = Number(item.lng);
        if (!isNaN(lat) && !isNaN(lng) && lat !== 0 && !item.isRendered) {
            const marker = new naver.maps.Marker({
                position: new naver.maps.LatLng(lat, lng),
                map: map,
                icon: { content: `<div class="label-saved">${item.type || '무료'}</div>`, anchor: new naver.maps.Point(30, 15) }
            });
            attachInfoWindow(marker, item);
            item.isRendered = true;
        }
    });
}

// [4] 상세 정보창 (장소 후기용)
function attachInfoWindow(marker, item) {
    const idSafe = (item.name || "noname").replace(/\s/g, '');
    let commentsHtml = item.comments && item.comments.length > 0 ? item.comments.map(c => `
        <div class="comment-item" style="padding:8px 0; border-bottom:1px solid #f9f9f9;">
            <div style="font-size:11px; font-weight:bold; color:#555;">${c.user} <span style="color:#f39c12; margin-left:5px;">⭐${c.rating}</span></div>
            <div style="font-size:12px; color:#333; margin-top:2px;">${c.comment}</div>
        </div>`).join('') : "<div style='font-size:11px; color:#999; text-align:center; padding:15px;'>등록된 후기가 없습니다.</div>";

    const contentHtml = `
        <div class="custom-info-window">
            <div class="title-wrap">
                <span style="font-size:18px; font-weight:900;">${item.name}</span>
                <span class="avg-star">⭐ ${item.avgRating || '0.0'}</span>
            </div>
            <div class="info-grid">
                <div class="info-item"><span class="info-label">유형</span><span class="info-value">${item.type}</span></div>
                <div class="info-item"><span class="info-label">제보자</span><span class="info-value">${item.user}</span></div>
                <div class="info-full"><span class="info-label">주소</span><span class="info-value">${item.address}</span></div>
            </div>
            <div class="comment-list" style="max-height:110px; overflow-y:auto; border-top:1px solid #FFD400; margin:10px 0;">${commentsHtml}</div>
            <div class="feedback-section">
                <div class="star-rating" id="star-wrap-${idSafe}">
                    ${[1,2,3,4,5].map(n => `<span class="star-btn" onclick="setRatingUI('${idSafe}', ${n})">★</span>`).join('')}
                    <input type="hidden" id="rate-val-${idSafe}" value="5">
                </div>
                <div class="comment-input-box">
                    <input type="text" id="cmt-msg-${idSafe}" class="comment-txt" placeholder="후기 입력">
                    <button class="comment-submit" onclick="sendFeedback('${item.name}')">등록</button>
                </div>
            </div>
        </div>`;

    const info = new naver.maps.InfoWindow({ content: contentHtml, borderWidth: 0, backgroundColor: "transparent", disableAnchor: true, pixelOffset: new naver.maps.Point(0, -10) });
    naver.maps.Event.addListener(marker, 'click', () => {
        if (currentInfo) currentInfo.close();
        info.open(map, marker);
        currentInfo = info;
        setTimeout(() => setRatingUI(idSafe, 5), 100);
    });
}

// [5] 부가 기능들
function setRatingUI(id, score) {
    const stars = document.querySelectorAll(`#star-wrap-${id} .star-btn`);
    const input = document.getElementById(`rate-val-${id}`);
    if(input) input.value = score;
    stars.forEach((s, i) => s.classList.toggle('active', i < score));
}

async function sendFeedback(targetName) {
    const idSafe = targetName.replace(/\s/g, '');
    const user = localStorage.getItem('gj-nick') || "익명";
    const msg = document.getElementById(`cmt-msg-${idSafe}`).value;
    const rate = document.getElementById(`rate-val-${idSafe}`).value;
    if (!msg) return alert("내용을 입력해주세요!");
    const q = new URLSearchParams({ type: "add_comment", target_id: targetName, user: user, comment: msg, rating: rate });
    await fetch(`${SCRIPT_URL}?${q.toString()}`, { mode: 'no-cors' });
    alert("반영되었습니다!"); location.reload();
}

function setupEvents() {
    naver.maps.Event.addListener(map, 'click', (e) => {
        if (currentInfo) currentInfo.close();
        if (pickMarker) pickMarker.setMap(null);
        pickMarker = new naver.maps.Marker({ position: e.coord, map: map, icon: { content: '<div class="report-marker"></div>', anchor: new naver.maps.Point(12, 24) } });
        naver.maps.Service.reverseGeocode({ coords: e.coord, orders: [naver.maps.Service.OrderType.ADDR, naver.maps.Service.OrderType.ROAD_ADDR].join(',') }, (status, res) => {
            if (status === naver.maps.Service.Status.OK) { addrStr = res.v2.address.roadAddress || res.v2.address.jibunAddress; }
        });
    });
}

// [수정] 서버 호출 없이 메모리에 저장된 데이터를 즉시 보여줌
function openBoard() {
    const boardPage = document.getElementById('board-page');
    const menu = document.getElementById('floating-menu');
    
    if (boardPage) {
        boardPage.classList.remove('hidden');
        if (menu) menu.style.display = 'none';
        
        // 이미 preFetchData에서 가져온 boardData를 바로 뿌려줍니다.
        renderBoard(); 
        console.log("⚡ 서버 대기 없이 즉시 렌더링 완료");
    }
}

function closeBoard() {
    const boardPage = document.getElementById('board-page');
    const menu = document.getElementById('floating-menu');
    if (boardPage) {
        boardPage.classList.add('hidden');
        if (menu) menu.style.display = 'flex';
    }
}

async function fetchBoard() {
    try {
        const res = await fetch(`${SCRIPT_URL}?type=get_board&t=${new Date().getTime()}`);
        boardData = await res.json();
        renderBoard();
    } catch (e) { console.error("데이터 로드 실패"); }
}

function renderBoard() {
    const content = document.getElementById('board-content');
    const writeBtn = document.getElementById('write-btn');
    if(writeBtn) writeBtn.style.display = 'block';
    
    content.innerHTML = `
        <div id="post-list">
            ${boardData.map(p => `
                <div class="post-card" onclick="viewPostDetail('${p.id}')" style="cursor:pointer; border-bottom:1px solid #eee; padding:20px 0;">
                    <div style="font-size:12px; color:#999; margin-bottom:5px;">${p.author}</div>
                    <h3 style="margin:0 0 8px 0; font-size:18px;">${p.title}</h3>
                    <div style="color:#FFD400; font-size:12px; font-weight:bold;">💬 댓글 ${p.comments ? p.comments.length : 0}</div>
                </div>
            `).join('')}
        </div>`;
}

// [보정] 글 등록이나 댓글 작성 후 실행할 데이터 갱신 함수
async function refreshBoardData(postId = null) {
    const res = await fetch(`${SCRIPT_URL}?type=get_board&t=${new Date().getTime()}`);
    boardData = await res.json();
    
    if (postId) {
        viewPostDetail(postId); // 댓글 작성 시 해당 글 유지
    } else {
        renderBoard(); // 새 글 등록 시 목록으로 이동
    }
}

function showWriteForm() {
    const boardContent = document.getElementById('board-content');
    boardContent.innerHTML = `
        <div class="write-form" style="animation: fadeIn 0.3s;">
            <button onclick="renderBoard()" class="back-btn" style="margin-bottom:15px;">← 목록으로 돌아가기</button>
            <h4 style="margin-bottom:15px;">새로운 수다 남기기 ✍️</h4>
            <input type="text" id="b-title" placeholder="제목" style="width:100%; padding:12px; margin-bottom:10px; border-radius:10px; border:1px solid #ddd; box-sizing:border-box;">
            <textarea id="b-content" placeholder="내용" style="width:100%; height:150px; padding:12px; margin-bottom:10px; border-radius:10px; border:1px solid #ddd; box-sizing:border-box; resize:none;"></textarea>
            <input type="text" id="b-link" placeholder="링크 (선택)" style="width:100%; padding:10px; margin-bottom:10px; border-radius:10px; border:1px solid #ddd; box-sizing:border-box;">
            <div style="margin-bottom:15px;">
                <label style="font-size:12px; font-weight:bold; color:#666;">📸 사진 첨부</label>
                <input type="file" id="b-file" accept="image/*" style="width:100%; margin-top:5px;">
            </div>
            <button onclick="submitPost()" class="btn-save" style="width:100%; background:#FFD400; font-size:18px; padding:15px;">등록하기</button>
        </div>`;
    document.getElementById('write-btn').style.display = 'none';
}

// [중요] 게시글 상세 보기 함수 보정
function viewPostDetail(postId) {
    const post = boardData.find(p => String(p.id) === String(postId));
    if (!post) return;

    const boardContent = document.getElementById('board-content');
    
    // 서버(GS)에서 이미 uc?id= 형태의 완성된 주소를 주므로, 
    // 정규표현식으로 다시 가공하지 않고 그대로 사용하거나 안전하게 필터링만 합니다.
    let imgUrl = post.imageUrl || "";

    boardContent.innerHTML = `
        <div class="post-detail" style="animation: fadeIn 0.3s;">
            <button onclick="renderBoard()" class="back-btn" style="margin-bottom:15px;">← 목록으로</button>
            <h2 style="margin:0 0 10px 0; font-size:22px;">${post.title}</h2>
            <div style="font-size:12px; color:#999; margin-bottom:20px;">
                작성자: ${post.author} | ${new Date(post.date).toLocaleString()}
            </div>
            
            ${imgUrl ? `<img src="${imgUrl}" style="width:100%; border-radius:15px; margin-bottom:20px; border:1px solid #eee;" onerror="console.log('이미지 로드 실패'); this.style.display='none';">` : ""}
            
            <p style="font-size:15px; line-height:1.7; white-space:pre-wrap; margin-bottom:30px;">${post.content}</p>
            
            ${post.link ? `<a href="${post.link}" target="_blank" style="display:block; padding:12px; background:#f0f7ff; color:#007bff; text-decoration:none; border-radius:10px; margin-bottom:20px; font-size:13px; font-weight:bold;">🔗 링크 바로가기</a>` : ""}
            
            <div class="detail-comments" style="border-top:2px solid #FFD400; padding-top:20px;">
                <h5>댓글 (${post.comments ? post.comments.length : 0})</h5>
                <div id="b-comment-list">
                    ${post.comments && post.comments.length > 0 ? post.comments.map(c => `<div style="background:#f9f9f9; padding:10px; border-radius:10px; margin-bottom:8px; font-size:13px;"><b>${c.user}</b>: ${c.text}</div>`).join('') : "<p style='color:#999; font-size:12px;'>첫 댓글을 남겨보세요!</p>"}
                </div>
                <div style="display:flex; gap:8px; margin-top:20px;">
                    <input type="text" id="cmt-in-${post.id}" placeholder="댓글 입력" style="flex:1; padding:10px; border:1px solid #ddd; border-radius:10px;">
                    <button onclick="submitBoardComment('${post.id}')" style="background:#FFD400; border:none; border-radius:10px; padding:0 15px; font-weight:bold; cursor:pointer;">등록</button>
                </div>
            </div>
        </div>`;
    document.getElementById('write-btn').style.display = 'none';
    window.scrollTo(0, 0);
}

async function submitPost() {
    const title = document.getElementById('b-title').value;
    const content = document.getElementById('b-content').value;
    const link = document.getElementById('b-link').value;
    const fileEl = document.getElementById('b-file');
    const nick = localStorage.getItem('gj-nick') || "익명";

    if (!title || !content) return alert("제목과 내용을 입력해주세요!");

    // 저장 중 버튼 비활성화
    const saveBtn = document.querySelector('.btn-save');
    saveBtn.innerText = "저장 중... (창을 닫지 마세요)";
    saveBtn.disabled = true;

    const sendData = async (imgBase64) => {
        // [중요] 모든 데이터를 하나의 JSON 객체로 묶습니다.
        const payload = {
            user: nick,
            title: title,
            content: content,
            link: link,
            image_data: imgBase64
        };

        try {
            // [보정] URL 파라미터로 type=add_post를 명시해줍니다.
            const response = await fetch(`${SCRIPT_URL}?type=add_post`, {
                method: 'POST',
                body: JSON.stringify(payload)
            });
            
            const result = await response.json();
            
            if (result.res === "ok") {
                alert("성공적으로 등록되었습니다!");
                // [핵심] 지도로 가지 않고, 수다물 목록을 다시 불러오고 보여줍니다.
                const res = await fetch(`${SCRIPT_URL}?type=get_board&t=${new Date().getTime()}`);
                boardData = await res.json();
                renderBoard(); 
            } else {
                alert("서버 저장 실패: " + result.msg);
            }
        } catch (error) {
            console.error("전송 에러:", error);
            // 구글 특유의 리다이렉트 에러가 나더라도 데이터가 들어가는 경우가 많으므로 확인 절차를 거칩니다.
            alert("전송 과정에 응답 지연이 있습니다. 목록을 갱신합니다.");
            fetchBoard(); 
        } finally {
            saveBtn.innerText = "등록하기";
            saveBtn.disabled = false;
        }
    };

    if (fileEl.files.length > 0) {
        const reader = new FileReader();
        reader.onload = () => sendData(reader.result);
        reader.readAsDataURL(fileEl.files[0]);
    } else {
        sendData("");
    }
}

async function submitBoardComment(postId) {
    const nick = localStorage.getItem('gj-nick') || "익명";
    const msg = document.getElementById(`cmt-in-${postId}`).value;
    if (!msg) return alert("내용 입력!");
    const q = new URLSearchParams({ type: "add_board_comment", post_id: postId, user: nick, comment: msg });
    await fetch(`${SCRIPT_URL}?${q.toString()}`, { mode: 'no-cors' });
    alert("댓글 등록!");
    // 데이터 갱신 후 상세 페이지 재출력
    const res = await fetch(`${SCRIPT_URL}?type=get_board&t=${new Date().getTime()}`);
    boardData = await res.json();
    viewPostDetail(postId);
}

async function submitReport() {
    const nick = document.getElementById('nick').value;
    const name = document.getElementById('pname').value;
    const type = document.getElementById('ptype').value;
    const desc = document.getElementById('pdesc').value;
    if (!nick || !name) return alert("필수 항목 입력!");
    const q = new URLSearchParams({ type: "report", user: nick, name: name, ptype: type, addr: addrStr, desc: desc, lat: pickMarker.getPosition().lat(), lng: pickMarker.getPosition().lng() });
    await fetch(`${SCRIPT_URL}?${q.toString()}`, { mode: 'no-cors' });
    alert("제보 완료!"); location.reload();
}

function moveToMyLoc() { navigator.geolocation.getCurrentPosition((pos) => { if (map) map.panTo(new naver.maps.LatLng(pos.coords.latitude, pos.coords.longitude)); }); }
function openModal() { if (!pickMarker) return alert("위치 선택!"); document.getElementById('addr-text').innerText = "📍 " + addrStr; document.getElementById('modal').classList.remove('hidden'); }
function closeModal() { document.getElementById('modal').classList.add('hidden'); }

window.onload = () => { preFetchData(); initMap(); };