import { CELL_W, CELL_H, HEADER_H, ROOM_COL_W, BUFFER_DAYS } from '../core/config.js';

const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };

export class ScrollManager {
  constructor(wrapper, vscroll, vscrollInner, onScroll) {
    this._vscroll      = vscroll;
    this._vscrollInner = vscrollInner;
    this._onScroll     = onScroll;
    this.W = 0;
    this.H = 0;
    this.offsetX   = 0;
    this.offsetY   = 0;
    this.windowDays = [];
    this._numRooms  = 0;
    this._built     = false;
    this._attachListeners(wrapper, vscroll);
  }

  // ── public ────────────────────────────────────────────────────────────────

  setNumRooms(n) {
    this._numRooms = n;
    this._vscrollInner.style.height = (n * CELL_H + HEADER_H) + 'px';
  }

  resize(W, H) {
    this.W = W;
    this.H = H;
    this._vscroll.style.height = H + 'px';
    if (!this._built) { this._buildWindow(); this._built = true; }
    this._onScroll();
  }

  get windowStart()    { return this.windowDays[0]; }
  get firstColIndex()  { return Math.floor(this.offsetX / CELL_W); }
  get colOffset()      { return this.offsetX % CELL_W; }
  get firstRowIndex()  { return Math.floor(this.offsetY / CELL_H); }
  get rowOffset()      { return this.offsetY % CELL_H; }
  visibleCols()        { return Math.ceil((this.W - ROOM_COL_W) / CELL_W) + 2; }
  visibleRows()        { return Math.ceil((this.H - HEADER_H)  / CELL_H) + 2; }

  // ── private ───────────────────────────────────────────────────────────────

  _buildWindow() {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const total = BUFFER_DAYS + this.visibleCols() + BUFFER_DAYS;
    this.windowDays = Array.from({ length: total }, (_, i) => addDays(today, i - BUFFER_DAYS));
    this.offsetX = BUFFER_DAYS * CELL_W;
  }

  scroll(dx, dy) {
    if (dx !== 0) {
      this.offsetX = Math.max(0, this.offsetX + dx);
      this._checkBounds();
    }
    if (dy !== 0) {
      this.offsetY += dy;
      this._clampY();
      this._vscroll.scrollTop = this.offsetY;
    }
    this._onScroll();
  }

  _checkBounds() {
    const threshold = BUFFER_DAYS * CELL_W * 0.25;
    const rightEdge = (this.windowDays.length - this.visibleCols()) * CELL_W;
    if      (this.offsetX > rightEdge - threshold) {this._shiftRight();}
    else if (this.offsetX < threshold)             {this._shiftLeft();}
  }

  _shiftRight() {
    const last = this.windowDays[this.windowDays.length - 1];
    for (let i = 1; i <= BUFFER_DAYS; i++) {this.windowDays.push(addDays(last, i));}
    this.windowDays.splice(0, BUFFER_DAYS);
    this.offsetX -= BUFFER_DAYS * CELL_W;
  }

  _shiftLeft() {
    const first = this.windowDays[0];
    const pre = Array.from({ length: BUFFER_DAYS }, (_, i) => addDays(first, i - BUFFER_DAYS));
    this.windowDays = pre.concat(this.windowDays);
    this.windowDays.splice(this.windowDays.length - BUFFER_DAYS, BUFFER_DAYS);
    this.offsetX += BUFFER_DAYS * CELL_W;
  }

  _clampY() {
    const maxY = Math.max(0, this._numRooms * CELL_H - (this.H - HEADER_H));
    this.offsetY = Math.max(0, Math.min(maxY, this.offsetY));
  }

  _attachListeners(wrapper, vscroll) {
    wrapper.addEventListener('wheel', (e) => {
      if (Math.abs(e.deltaX) >= Math.abs(e.deltaY)) {
        e.preventDefault();
        this.offsetX = Math.max(0, this.offsetX + e.deltaX);
        this._checkBounds(); this._onScroll();
      }
    }, { passive: false });

    wrapper.addEventListener('wheel', (e) => {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        this.offsetY += e.deltaY;
        this._clampY();
        vscroll.scrollTop = this.offsetY;
        this._onScroll();
      }
    }, { passive: true });

    vscroll.addEventListener('scroll', () => {
      this.offsetY = vscroll.scrollTop; this._onScroll();
    });

    let drag = false, moved = false, sx, sy, sox, soy;
    wrapper.addEventListener('mousedown', (e) => {
      if (e.target === vscroll) {return;}
      if (this.onDragIntercept && this.onDragIntercept(e)) {return;}
      drag = true; moved = false;
      sx = e.clientX; sy = e.clientY; sox = this.offsetX; soy = this.offsetY;
      wrapper.classList.add('grabbing');
    });
    window.addEventListener('mousemove', (e) => {
      if (!drag) {return;}
      if (!moved && (Math.abs(e.clientX - sx) > 4 || Math.abs(e.clientY - sy) > 4)) {moved = true;}
      const rawX = Math.max(0, sox + (sx - e.clientX));
      this.offsetX = rawX;
      this.offsetY = soy + (sy - e.clientY);
      this._clampY(); vscroll.scrollTop = this.offsetY;
      this._checkBounds();
      if (this.offsetX !== rawX) { sox += this.offsetX - rawX; }
      this._onScroll();
    });
    window.addEventListener('mouseup', (e) => {
      if (drag && !moved && this.onGridClick) {this.onGridClick(e);}
      drag = false; wrapper.classList.remove('grabbing');
    });

    let tx, ty, tox, toy, tMoved, tDragging, _lpTimer;
    wrapper.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1) {return;}
      e.preventDefault();
      tx = e.touches[0].clientX; ty = e.touches[0].clientY;
      tox = this.offsetX; toy = this.offsetY;
      tMoved = false; tDragging = false;
      _lpTimer = setTimeout(() => {
        _lpTimer = null;
        if (!tMoved && this.onDragIntercept) {
          if (this.onDragIntercept({ clientX: tx, clientY: ty })) {
            tDragging = true;
            if (navigator.vibrate) {navigator.vibrate(40);}
          }
        }
      }, 350);
    }, { passive: false });
    wrapper.addEventListener('touchmove', (e) => {
      if (e.touches.length !== 1) {return;}
      e.preventDefault();
      if (!tMoved && (Math.abs(e.touches[0].clientX - tx) > 6 || Math.abs(e.touches[0].clientY - ty) > 6)) {
        tMoved = true;
        if (_lpTimer) { clearTimeout(_lpTimer); _lpTimer = null; }
      }
      if (tDragging) {
        if (this.onDragTouchMove) {this.onDragTouchMove(e.touches[0].clientX, e.touches[0].clientY);}
        return;
      }
      const rawX = Math.max(0, tox + (tx - e.touches[0].clientX));
      this.offsetX = rawX;
      this._checkBounds();
      if (this.offsetX !== rawX) {tox += this.offsetX - rawX;}
      this.offsetY = toy + (ty - e.touches[0].clientY);
      this._clampY(); vscroll.scrollTop = this.offsetY;
      this._onScroll();
    }, { passive: false });
    wrapper.addEventListener('touchend', () => {
      if (_lpTimer) { clearTimeout(_lpTimer); _lpTimer = null; }
      if (tDragging) {
        if (this.onDragTouchEnd) {this.onDragTouchEnd();}
      } else if (!tMoved && this.onGridClick) {
        this.onGridClick({ clientX: tx, clientY: ty });
      }
      tDragging = false;
    }, { passive: true });
  }
}
