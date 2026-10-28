/* Tendril guides: the name-change checklist (tendril:guides.checklist). */
(function () {
  "use strict";

  const T = window.Tendril;
  const $ = function (id) { return document.getElementById(id); };

  const GROUPS = [
    { title: "Official documents", items: [
      ["id", "National ID card"], ["passport", "Passport"], ["license", "Driving licence"],
      ["residence", "Residence permit or visa, if you have one"], ["tax", "Tax office records"],
      ["voter", "Electoral or voter registration"]
    ] },
    { title: "Money", items: [
      ["bank", "Bank accounts and cards"], ["pension", "Pension or retirement savings"],
      ["insurance", "Insurance policies (home, car, life)"], ["paypal", "Payment apps"]
    ] },
    { title: "Health", items: [
      ["doctor", "Your GP or family doctor"], ["clinics", "Other clinics and specialists"],
      ["health-ins", "Health insurance or health card"], ["pharmacy", "Pharmacy"],
      ["dentist", "Dentist"]
    ] },
    { title: "Work and study", items: [
      ["employer", "Employer and payroll"], ["work-accounts", "Work email and accounts"],
      ["school", "School or university"], ["certificates", "Degrees and certificates"],
      ["cv", "CV and professional profiles"]
    ] },
    { title: "Home and everyday", items: [
      ["phone", "Phone contract"], ["utilities", "Electricity, gas, water and internet"],
      ["lease", "Rental contract or mortgage"], ["post", "Post office and deliveries"],
      ["memberships", "Gym, library and other memberships"], ["travel", "Travel, transport and loyalty cards"]
    ] },
    { title: "Online", items: [
      ["email", "Personal email address and display name"], ["social", "Social media profiles"],
      ["shopping", "Online shops and subscriptions"], ["messaging", "Messaging apps"],
      ["games", "Gaming and streaming accounts"]
    ] }
  ];

  const total = GROUPS.reduce(function (n, g) { return n + g.items.length; }, 0);

  function render() {
    const done = T.store.get("guides.checklist", {});
    const host = $("checklist");
    host.innerHTML = "";
    GROUPS.forEach(function (g) {
      const fs = document.createElement("fieldset");
      fs.className = "check-group";
      const lg = document.createElement("legend");
      lg.textContent = g.title;
      fs.appendChild(lg);
      g.items.forEach(function (it) {
        const label = document.createElement("label");
        label.className = "check-item";
        label.innerHTML = '<input type="checkbox"><span></span>';
        const box = label.querySelector("input");
        box.id = "chk-" + it[0];
        box.checked = !!done[it[0]];
        label.querySelector("span").textContent = it[1];
        box.addEventListener("change", function () {
          const cur = T.store.get("guides.checklist", {});
          if (box.checked) cur[it[0]] = new Date().toISOString(); else delete cur[it[0]];
          T.store.set("guides.checklist", cur);
          progress();
        });
        fs.appendChild(label);
      });
      host.appendChild(fs);
    });
    progress();
  }

  function progress() {
    const n = Object.keys(T.store.get("guides.checklist", {})).length;
    $("check-count").textContent = n + " of " + total + " done";
    $("check-bar").style.width = (n / total * 100) + "%";
  }

  const reset = $("check-reset");
  reset.addEventListener("click", function () {
    if (!reset.dataset.armed) {
      reset.dataset.armed = "1";
      reset.textContent = "Tap again to untick everything";
      setTimeout(function () { delete reset.dataset.armed; reset.textContent = "Untick everything"; }, 3000);
      return;
    }
    T.store.remove("guides.checklist");
    delete reset.dataset.armed;
    reset.textContent = "Untick everything";
    render();
  });

  render();
})();
