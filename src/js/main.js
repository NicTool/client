// Import our custom CSS
import "../scss/styles.scss";
import "datatables.net-bs5/css/dataTables.bootstrap5.css";

// Import all of Bootstrap's JS
import * as bootstrap from "bootstrap";
import DataTable from "datatables.net-bs5";

import * as RR from "@nictool/dns-resource-record";

const API_URI = "https://mattbook-m3.home.simerson.net:3000";
let nsDataTable;
let zoneDataTable;
const zoneColumnSearchTimers = new Map();

const ajax = async (config) => {
  const request = await fetch(config.url, {
    method: config.method,
    mode: "cors",
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${Cookie.get("nt-token")}`,
      ...config.headers,
    },
    body: JSON.stringify(config.payload),
  });
  try {
    let response = await request.json();
    return response;
  } catch (error) {
    console.error("Error with fetch:", error);
    // alert error;
  }
};

const Cookie = {
  // https://stackoverflow.com/questions/4825683/how-do-i-create-and-read-a-value-from-cookie-with-javascript
  get: (name) => {
    let c = document.cookie.match(
      `(?:(?:^|.*; *)${name} *= *([^;]*).*$)|^.*$`,
    )[1];
    if (c) return decodeURIComponent(c);
  },
  set: (name, value, opts = {}) => {
    if (opts.days) {
      opts["max-age"] = opts.days * 60 * 60 * 24;
      delete opts.days;
    }

    opts = Object.entries(opts).reduce(
      (accumulatedStr, [k, v]) => `${accumulatedStr}; ${k}=${v}`,
      "",
    );

    document.cookie = name + "=" + encodeURIComponent(value) + opts;
  },
  delete: (name, opts) => Cookie.set(name, "", { "max-age": -1, ...opts }),
  // path & domain must match cookie being deleted
};

function onLoad() {
  console.log("onLoad");
  populateZrEditType();

  if (!Cookie.get("nt-token")) {
    console.log(`Cookie/token not found`);
    document.getElementById("login_div").style.display = "block";
    return;
  }

  ajax({
    method: "GET",
    url: `${API_URI}/session`,
  })
    .then((response) => {
      console.log("GET /session response", response);
      console.log(response);
      if (response?.error) {
        switch (response.message) {
          case "Token expired":
          case "Token maximum age exceeded":
            Cookie.delete("nt-token");
            document.getElementById("login_div").style.display = "block";
            break;
          default:
            console.error(response.message);
            break;
        }
      }
      if (response?.user?.id) onLoggedIn(response);
    })
    .catch((error) => {
      console.error("Error fetching session:", error);
    });
}

function onLoggedIn(response) {
  document.getElementById("login_div").style.display = "none";
  document.getElementById("loggedInMain").style.display = "block";
  document.getElementById("loggedInMain").classList.add("show");
  document.getElementById("groups_ul").innerHTML =
    `<li gid="${response.group.id}">${response.group.name}</li>`;
  // document.getElementById('group_current').innerHTML = `${response.group.name}`;

  // ajax({
  //     method: 'GET',
  //     url: `${API_URI}/permission/${response.user.id}`,
  // })
  // .then((response) => {
  //     console.log('GET /permission response', response);
  // })

  showNameservers();
  showZones();
}

function onLoggedOut() {
  document.getElementById("loggedInMain").style.display = "none";
  // document.getElementById('groups').style.display = 'none';
  // document.getElementById('zones').style.display = 'none';
  // document.getElementById('nameservers').style.display = 'none';
  document.getElementById("login_div").style.display = "block";
}

function attemptLogin() {
  console.log("attempting login");

  try {
    ajax({
      method: "POST",
      url: `${API_URI}/session`,
      payload: {
        username: document.getElementById("username").value,
        password: document.getElementById("password").value,
      },
    }).then((response) => {
      console.log("login response", response);
      if (response.session) {
        Cookie.set("nt-token", response.session.token, { days: 1 });
        onLoggedIn(response);
      }
      console.log("document.cookie", document.cookie);
    });
  } catch (error) {
    console.error("Error logging in:", error);
    alert("Login failed. Please check your username and password.");
  }
}

function attemptLogout() {
  console.log("attempting logout");
  ajax({
    method: "DELETE",
    url: `${API_URI}/session`,
  })
    .then((response) => {
      // console.log('logout response', response);
      if (response) {
        Cookie.delete("nt-token");
        onLoggedOut();
      }
    })
    .catch((error) => {
      console.error("Error logging out:", error);
      // alert('Logout failed. Please try again.');
    });

  return false;
}

function showNameservers() {
  ajax({
    method: "GET",
    url: `${API_URI}/nameserver`,
  }).then((response) => {
    console.log("GET /nameserver response", response);
    const table = document.getElementById("ns_table");
    const tableHead = table.querySelector("thead");

    // Remove existing filter row before re-initializing.
    while (tableHead.rows.length > 1) {
      tableHead.deleteRow(1);
    }

    if (nsDataTable) {
      nsDataTable.destroy();
      nsDataTable = undefined;
    }

    const body = table.querySelector("tbody");
    body.innerHTML = "";

    const sorted = response.nameserver
      .slice()
      .sort((a, b) => Number(a.id) - Number(b.id));

    for (const ns of sorted) {
      const row = document.createElement("tr");
      row.classList.add("accordion-item");
      row.id = `ns_${ns.id}_tr`;
      row.innerHTML = `
                <td>${ns.name ?? ""}</td>
                <td>${ns.description ?? ""}</td>
                <td style="text-align: right;">${ns.address ?? ""}</td>
                <td style="text-align: right;">${ns.address6 ?? ""}</td>
                <td style="text-align: center">${ns.export?.type ?? ""}</td>
                <td style="text-align: center"><button type="button" class="btn btn-sm btn-outline-secondary">⛭</button></td>
            `;
      body.appendChild(row);
    }

    const filterRow = tableHead.rows[0].cloneNode(true);
    filterRow.classList.add("ns-filter-row");
    for (let i = 0; i < filterRow.cells.length; i++) {
      const cell = filterRow.cells[i];
      if (i === filterRow.cells.length - 1) {
        cell.innerHTML = "";
        continue;
      }
      const title = tableHead.rows[0].cells[i].textContent.trim();
      cell.innerHTML = `<input type="search" class="form-control form-control-sm" placeholder="Search ${title}" aria-label="Search ${title}">`;
    }
    tableHead.appendChild(filterRow);

    nsDataTable = new DataTable(table, {
      orderCellsTop: true,
      pageLength: 25,
      lengthMenu: [10, 25, 50, 100],
      columnDefs: [
        { orderable: false, searchable: false, targets: [5] },
      ],
      initComplete() {
        const api = this.api();
        api.columns().every(function (index) {
          const input = filterRow.cells[index].querySelector("input");
          if (!input) return;

          input.addEventListener("input", () => {
            if (this.search() !== input.value) {
              this.search(input.value).draw();
            }
          });
        });
      },
    });
  });
}

function showZones() {
  const ztbody = document.getElementById("zone_tbody");
  if (!ztbody) return;
  const table = document.getElementById("zone_table");
  if (!table) return;

  if (zoneDataTable) {
    zoneDataTable.ajax.reload();
    return;
  }

  const tableHead = table.querySelector("thead");
  while (tableHead.rows.length > 1) {
    tableHead.deleteRow(1);
  }

  const filterRow = tableHead.rows[0].cloneNode(true);
  filterRow.classList.add("zone-filter-row");
  for (let i = 0; i < filterRow.cells.length; i++) {
    if (i === 0) {
      filterRow.cells[i].innerHTML = "";
      continue;
    }
    const title = tableHead.rows[0].cells[i].textContent.trim();
    filterRow.cells[i].innerHTML = `<input type="search" class="form-control form-control-sm" placeholder="Search ${title}" aria-label="Search ${title}">`;
  }
  tableHead.appendChild(filterRow);

  zoneDataTable = new DataTable(table, {
    processing: true,
    serverSide: true,
    searchDelay: 400,
    orderCellsTop: true,
    pageLength: 25,
    lengthMenu: [10, 25, 50, 100],
    columnDefs: [{ orderable: false, searchable: false, targets: [0] }],
    order: [[1, "asc"]],
    columns: [
      {
        data: null,
        defaultContent: "▸",
        className: "text-center",
      },
      { data: "zone", defaultContent: "" },
      { data: "description", defaultContent: "" },
    ],
    async ajax(data, callback) {
      const params = new URLSearchParams();
      params.set("limit", `${data.length}`);
      params.set("offset", `${data.start}`);

      const globalSearch = `${data.search?.value ?? ""}`.trim();
      if (globalSearch) params.set("search", globalSearch);

      const zoneLike = `${data.columns?.[1]?.search?.value ?? ""}`.trim();
      if (zoneLike) params.set("zone_like", zoneLike);

      const descriptionLike = `${data.columns?.[2]?.search?.value ?? ""}`.trim();
      if (descriptionLike) params.set("description_like", descriptionLike);

      const order = data.order?.[0] ?? { column: 1, dir: "asc" };
      const sortBy = { 1: "zone", 2: "description" }[order.column] ?? "zone";
      params.set("sort_by", sortBy);
      params.set("sort_dir", order.dir === "desc" ? "desc" : "asc");

      const response = await ajax({
        method: "GET",
        url: `${API_URI}/zone?${params.toString()}`,
      });

      const rows = response?.zone ?? [];
      const total = response?.meta?.pagination?.total ?? rows.length;
      const filtered = response?.meta?.pagination?.filtered ?? total;

      callback({
        data: rows,
        recordsTotal: total,
        recordsFiltered: filtered,
      });
    },
    createdRow(row, data) {
      row.id = `zone_${data.id}_tr`;
      row.dataset.zoneId = `${data.id}`;
      if (row.cells[0]) row.cells[0].textContent = "▸";
    },
    initComplete() {
      const api = this.api();
      api.columns().every(function (index) {
        const input = filterRow.cells[index].querySelector("input");
        if (!input) return;

        input.addEventListener("input", () => {
          clearTimeout(zoneColumnSearchTimers.get(index));
          zoneColumnSearchTimers.set(
            index,
            setTimeout(() => {
              if (this.search() !== input.value) {
                this.search(input.value).draw();
              }
            }, 400),
          );
        });
      });
    },
  });

  ztbody.onclick = (event) => {
    const tr = event.target.closest("tr");
    if (!tr) return;

    const row = zoneDataTable.row(tr);
    const zone = row.data();
    if (!zone) return;

    if (row.child.isShown()) {
      row.child.hide();
      tr.classList.remove("shown");
      const indicator = tr.cells[0];
      if (indicator) indicator.textContent = "▸";
      return;
    }

    row.child(`
                <div class="accordion-body">
                    <table id="zone_${zone.id}_table" class="table table-md table-striped table-hover table-bordered">
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Type</th>
                                <th>TTL</th>
                                <th>Data</th>
                            </tr>
                        </thead>
                        <tbody id="zone_${zone.id}_tbody"></tbody>
                    </table>
                </div>
            `).show();
    tr.classList.add("shown");
    const indicator = tr.cells[0];
    if (indicator) indicator.textContent = "▾";
    showZoneRecords(zone);
  };
}

function showZoneRecords(zone) {
  const tbody = document.getElementById(`zone_${zone.id}_tbody`);
  if (!tbody) return;
  tbody.innerHTML = "";

  ajax({
    method: "GET",
    url: `${API_URI}/zone_record/?zid=${zone.id}`,
  }).then((response) => {
    // console.log('GET /zone_record response', response);

    for (const zr of response.zone_record) {
      console.log(zr);
      const row = document.createElement("tr");
      try {
        const owner =
          zr.owner === `${zone.zone}.`
            ? zr.owner
            : zr.owner.endsWith(`${zone.zone}.`)
              ? zr.owner
              : `${zr.owner}.${zone.zone}.`;
        // console.log('owner', owner);
        const rrCtor = RR[zr.type];
        const asRR = new rrCtor({ ...zr, owner, type: rrCtor.name });
        // console.log('asRR', asRR)
        row.asRR = asRR;
        zr.rdata = asRR
          .getRdataFields()
          .map((f) => asRR.get(f))
          .join(" ");
      } catch (error) {
        console.error("Error creating RR:", error);
      }
      row.id = `zr_${zr.id}_tr`;

      row.setAttribute("data-bs-toggle", "modal");
      row.setAttribute("data-bs-target", `#zrEditModal`);
      row.setAttribute("aria-expanded", "true");
      row.setAttribute("aria-controls", `zrEditModal`);

      row.innerHTML = `
                <td class="small" id="zr_${zr.id}_td">${zr.owner}</td>
                <td class="small">${zr.type}</td>
                <td class="small">${zr.ttl}</td>
                <td class="small" style="width: 50%; word-break: break-all;">${zr.rdata}</td>
            `;
      tbody.appendChild(row);

      document
        .getElementById(`zr_${zr.id}_tr`)
        .addEventListener("click", (event) => {
          editZoneRecord(zone, zr, row.asRR);
        });
    }
  });
}

function populateZrEditType() {
  const sel = document.getElementById("zrEditType");
  // console.log(RR)

  for (const rr in RR) {
    if (["default", "typeMap"].includes(rr)) continue;
    const option = document.createElement("option");
    option.value = rr;
    option.asRR = new RR[rr](null);
    option.innerHTML = `${rr}  -  ${option.asRR.getDescription()}`;
    sel.appendChild(option);
  }
}

function getRdataInput(field, value = "", rr) {
  // console.log('getRdataInput', field)

  let input = `<input type="text" class="form-control" id="zrEdit${field}" value="${value}" placeholder=" ">`;

  if (rr[`get${rr.ucFirst(field)}Options`]) {
    input = `<select class="form-select" id="zrEdit${field}">`;
    for (const o of rr[`get${rr.ucFirst(field)}Options`]({ desc: true })) {
      input += `<option value="${o[0]}" ${value === o[0] ? "selected" : ""}>${o[0]}${o[1] ? ` - ${o[1]}` : ""}</option>`;
    }
    input += `</select>`;
  } else if (rr.get("type") === "NAPTR" && field === "flags") {
  } else {
    switch (field) {
      case "cert type":
      case "hash algorithm":
      case "flags":
      case "key tag":
      case "order":
      case "original ttl":
      case "port":
      case "precedence":
      case "preference":
      case "priority":
      case "protocol":
      case "service":
      case "weight":
        input = `<input type="number" class="form-control" id="zrEdit${field}" value="${value}" placeholder=" ">`;
        break;
    }
  }

  return `
    <div class="form-floating mb-3">${input}
        <label for="zrEdit${field}" class="form-label text-capitalize" style="">${field}</label>
        <div id="zrEdit${rr.ucFirst(field)}Help" class="form-text"></div>
    </div>`;
}

function changeRDataField(name, rr, event) {
  let value =
    event.target.type === "number"
      ? parseInt(event.target.value, 10)
      : /^\d+$/.test(event.target.value)
        ? parseInt(event.target.value, 10)
        : event.target.value;
  console.log(`${name} changed, value: ${value}`);
  const help = document.getElementById(`zrEdit${rr.ucFirst(name)}Help`);

  try {
    rr[`set${rr.ucFirst(name)}`](value);
    event.target.classList.add("is-valid");
    event.target.classList.remove("is-invalid");
    help.innerHTML = "";
  } catch (error) {
    // console.error(error);
    if (name === "type") {
      event.target.classList.add("is-valid");
      event.target.classList.remove("is-invalid");
      return;
    }
    event.target.classList.add("is-invalid");
    event.target.classList.remove("is-valid");
    help.innerHTML = `${error.message.split(/Example/)[0]}`;
  }
}

function populateZrEditRdata(rr, zr) {
  let editData = document.getElementById("zrEditRdata");
  editData.innerHTML = "";

  for (const f of rr.getRdataFields()) {
    editData.innerHTML += getRdataInput(f, zr[f], rr);
  }

  for (const f of rr.getRdataFields()) {
    const t = document.getElementById(`zrEdit${f}`);

    t.addEventListener("change", (event) => {
      changeRDataField(f, rr, event);
    });
    t.addEventListener("keyup", (event) => {
      changeRDataField(f, rr, event);
    });
  }
}

function editZoneRecord(zone, zr, rr) {
  console.log("editZoneRecord", zr);

  const owner = document.getElementById("zrEditOwner");
  owner.classList.remove("is-valid");
  owner.classList.remove("is-invalid");
  owner.addEventListener("change", (event) => {
    changeRDataField("owner", rr, event);
  });
  owner.addEventListener("keyup", (event) => {
    changeRDataField("owner", rr, event);
  });
  owner.value = zr.owner;
  document.getElementById("zrEditOwnerZone").innerHTML = `.${zone.zone}.`;

  const ttl = document.getElementById("zrEditTtl");
  ttl.classList.remove("is-valid");
  ttl.classList.remove("is-invalid");
  ttl.addEventListener("change", (event) => {
    changeRDataField("ttl", rr, event);
  });
  ttl.addEventListener("keyup", (event) => {
    changeRDataField("ttl", rr, event);
  });
  ttl.value = zr.ttl;

  const type = document.getElementById("zrEditType");
  type.classList.remove("is-valid");
  type.classList.remove("is-invalid");
  type.addEventListener("change", (event) => {
    changeRDataField("type", rr, event);
  });
  type.addEventListener("keyup", (event) => {
    changeRDataField("type", rr, event);
  });
  const typeRFCs = document.getElementById("zrEditTypeRFCs");
  typeRFCs.innerHTML = `RFCs: ${rr
    .getRFCs()
    .map(
      (r) =>
        `<a href="https://tools.ietf.org/html/rfc${r}" target="_blank">${r}</a>`,
    )
    .join(", ")}`;
  type.value = zr.type;

  type.addEventListener("change", (event) => {
    const selected = event.target.selectedOptions[0];
    console.log("selected", selected);
    const newRR = new RR[selected.value](null);
    populateZrEditRdata(newRR, zr);
    typeRFCs.innerHTML = `RFCs: ${newRR
      .getRFCs()
      .map(
        (r) =>
          `<a href="https://tools.ietf.org/html/rfc${r}" target="_blank">${r}</a>`,
      )
      .join(", ")}`;
  });

  populateZrEditRdata(rr, zr);
}

document
  .getElementById("login_form_submit")
  .addEventListener("click", (event) => {
    attemptLogin();
  });
document.getElementById("logout_button").addEventListener("click", (event) => {
  attemptLogout();
});

onLoad();
