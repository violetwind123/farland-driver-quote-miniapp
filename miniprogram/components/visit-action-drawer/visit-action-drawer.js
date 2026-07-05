// visit-action-drawer (design 5e)
// Emit-only operator action drawer. NO db / cloud.callFunction here —
// the HOST page owns all writes (calls opsVisitBookingAction) in its bind handlers.
// styleIsolation:'apply-shared' is set authoritatively in .json so the host page's
// @import "/styles/theme.wxss" classes (.seg-control/.cta-primary/.toast-dark/…)
// AND page-scope CSS custom properties (--ink-900 etc.) inherit into this component.
Component({
  properties: {
    visible: { type: Boolean, value: false },
    // Whitelisted OPERATOR ops shape only. Host MUST pass ONLY:
    // { id, school:{nameCn,nameEn}, status, statusText,
    //   slots:[{key,dateText,selected}], students:[{id,name,grade,selected}],
    //   materials:[{name,required,status}], confirmation:{confirmationNo} }
    // NEVER visitOffice/contactPerson/advisorNotes/timeline/cost/supplier/contact.
    booking: { type: Object, value: {} },
    // Host seeds the panel the triggering action intends to open on.
    // 'query' | 'submit' | 'upload' | 'materials' | 'reschedule'
    initialSeg: { type: String, value: 'submit' },
  },

  data: {
    activeSeg: 'submit', // 'query' | 'submit' | 'upload' | 'materials' | 'reschedule'
    selectedSlotKeys: [], // cap 2
    selectedStudentIds: [],
    noteText: '',
    confirmationNo: '',
    // upload confirmation: captured file + confirmed slot (backend hard-requires both)
    confirmFile: null, // { fileID, fileUrl?, name }
    confirmSlotDate: '', // YYYY-MM-DD
    confirmSlotStart: '',
    confirmSlotEnd: '',
    // reschedule: new confirmed slot
    reschedDate: '',
    reschedStart: '',
    reschedEnd: '',
    uploading: false,
    toast: { show: false, text: '' },
  },

  observers: {
    // When the host opens the drawer with an intended seg, honor it so each
    // action lands on its own panel instead of always 'submit'.
    'visible, initialSeg': function (visible, initialSeg) {
      if (!visible) return;
      const allowed = ['query', 'submit', 'upload', 'materials', 'reschedule'];
      const seg = allowed.indexOf(initialSeg) > -1 ? initialSeg : 'submit';
      if (seg !== this.data.activeSeg) this.setData({ activeSeg: seg });
    },
    // When a new booking is bound, seed selections from its whitelisted flags
    // and reset transient input so the drawer never leaks a prior booking's note.
    booking: function (booking) {
      const b = booking && typeof booking === 'object' ? booking : {};
      const slots = Array.isArray(b.slots) ? b.slots : [];
      const students = Array.isArray(b.students) ? b.students : [];
      const selectedSlotKeys = slots
        .filter((s) => s && s.selected)
        .map((s) => s.key)
        .slice(0, 2);
      const selectedStudentIds = students
        .filter((s) => s && s.selected)
        .map((s) => s.id);
      const confirmationNo =
        b.confirmation && b.confirmation.confirmationNo
          ? String(b.confirmation.confirmationNo)
          : '';
      // reset upload/reschedule transient inputs per booking
      this.setData({
        selectedSlotKeys,
        selectedStudentIds,
        confirmationNo,
        confirmFile: null,
        confirmSlotDate: '',
        confirmSlotStart: '',
        confirmSlotEnd: '',
        reschedDate: '',
        reschedStart: '',
        reschedEnd: '',
      });
    },
  },

  methods: {
    onSegTap(e) {
      this.setData({ activeSeg: e.currentTarget.dataset.seg });
    },

    onSlotTap(e) {
      const key = e.currentTarget.dataset.key;
      const current = this.data.selectedSlotKeys.slice();
      const idx = current.indexOf(key);
      if (idx > -1) {
        current.splice(idx, 1);
      } else if (current.length < 2) {
        current.push(key);
      } else {
        this.showToast('备选时段至多 2 个');
        return;
      }
      this.setData({ selectedSlotKeys: current });
    },

    onStudentTap(e) {
      const id = e.currentTarget.dataset.id;
      const current = this.data.selectedStudentIds.slice();
      const idx = current.indexOf(id);
      if (idx > -1) {
        current.splice(idx, 1);
      } else {
        current.push(id);
      }
      this.setData({ selectedStudentIds: current });
    },

    onNoteInput(e) {
      this.setData({ noteText: e.detail.value });
    },

    onConfirmNoInput(e) {
      this.setData({ confirmationNo: e.detail.value });
    },

    // Pick the school confirmation file (client-only API; no cloud/db here).
    // Host performs the storage upload in its bind:upload-confirm handler.
    onChooseConfirmFile() {
      const self = this;
      wx.chooseMessageFile({
        count: 1,
        type: 'file',
        success(res) {
          const file = (res.tempFiles && res.tempFiles[0]) || null;
          if (!file || !file.path) {
            self.showToast('未选择文件');
            return;
          }
          self.setData({
            confirmFile: {
              path: file.path,
              name: file.name || '学校确认函',
              size: file.size || 0,
            },
          });
        },
        fail() {
          // user cancel or unsupported entry; no toast needed for plain cancel
        },
      });
    },

    onConfirmSlotDate(e) {
      this.setData({ confirmSlotDate: e.detail.value });
    },
    onConfirmSlotStart(e) {
      this.setData({ confirmSlotStart: e.detail.value });
    },
    onConfirmSlotEnd(e) {
      this.setData({ confirmSlotEnd: e.detail.value });
    },

    onReschedDate(e) {
      this.setData({ reschedDate: e.detail.value });
    },
    onReschedStart(e) {
      this.setData({ reschedStart: e.detail.value });
    },
    onReschedEnd(e) {
      this.setData({ reschedEnd: e.detail.value });
    },

    onClose() {
      this.triggerEvent('close');
    },

    onQueryDate() {
      this.triggerEvent('query-date', { visitId: this.data.booking && this.data.booking.id });
    },

    onSubmit() {
      if (!this.data.selectedSlotKeys.length) {
        this.showToast('请至少选 1 个备选时段');
        return;
      }
      this.triggerEvent('submit', {
        visitId: this.data.booking && this.data.booking.id,
        slotKeys: this.data.selectedSlotKeys,
        studentIds: this.data.selectedStudentIds,
        note: this.data.noteText,
      });
      // Host shows the server-driven toast; no optimistic status claim here.
    },

    onSaveDraft() {
      this.triggerEvent('save-draft', {
        visitId: this.data.booking && this.data.booking.id,
        slotKeys: this.data.selectedSlotKeys,
        studentIds: this.data.selectedStudentIds,
        note: this.data.noteText,
      });
      this.showToast('已存草稿');
    },

    onUploadConfirm() {
      const confirmationNo = this.data.confirmationNo.trim();
      if (!confirmationNo) {
        this.showToast('请填写确认号');
        return;
      }
      if (!this.data.confirmFile || !this.data.confirmFile.path) {
        this.showToast('请选择确认函文件');
        return;
      }
      const date = String(this.data.confirmSlotDate || '').trim();
      if (!date) {
        this.showToast('请选择确认日期');
        return;
      }
      const confirmedSlot = {
        date,
        start: String(this.data.confirmSlotStart || '').trim(),
        end: String(this.data.confirmSlotEnd || '').trim(),
      };
      // Emit-only: host uploads the file to cloud storage then calls
      // opsVisitBookingAction with fileID + confirmedSlot. Host owns the toast.
      this.triggerEvent('upload-confirm', {
        visitId: this.data.booking && this.data.booking.id,
        confirmationNo,
        confirmedSlot,
        filePath: this.data.confirmFile.path,
        fileName: this.data.confirmFile.name,
      });
    },

    onReschedule() {
      const date = String(this.data.reschedDate || '').trim();
      if (!date) {
        this.showToast('请选择新的确认日期');
        return;
      }
      const confirmedSlot = {
        date,
        start: String(this.data.reschedStart || '').trim(),
        end: String(this.data.reschedEnd || '').trim(),
      };
      this.triggerEvent('reschedule', {
        visitId: this.data.booking && this.data.booking.id,
        confirmedSlot,
      });
      // Host shows the server-driven toast.
    },

    onMarkMaterials() {
      this.triggerEvent('mark-materials', {
        visitId: this.data.booking && this.data.booking.id,
        materials: Array.isArray(this.data.booking && this.data.booking.materials)
          ? this.data.booking.materials
          : [],
      });
      this.showToast('已标记材料');
    },

    showToast(text) {
      this.setData({ toast: { show: true, text } });
      if (this._toastTimer) clearTimeout(this._toastTimer);
      this._toastTimer = setTimeout(() => {
        this.setData({ 'toast.show': false });
      }, 2200);
    },
  },

  detached() {
    if (this._toastTimer) clearTimeout(this._toastTimer);
  },
});
