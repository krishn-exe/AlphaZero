import { useState } from "react";
import "./SubscribeAlert.css";

const DISTRICTS = [
  { id: null, name: "All Northeast India districts" },
  { id: 1, name: "Kamrup (Assam)" },
  { id: 2, name: "Khasi Hills (Meghalaya)" },
  { id: 3, name: "Imphal West (Manipur)" },
  { id: 4, name: "West Tripura (Tripura)" },
  { id: 5, name: "Aizawl (Mizoram)" },
];

function SubscribeAlert() {
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [districtId, setDistrictId] = useState(null);
  const [showExtra, setShowExtra] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    console.log({ email, phone, districtId });
  };

  return (
    <div className="subscribe-card">
      <div className="subscribe-header">
        <span className="subscribe-icon" aria-hidden="true">
          🔔
        </span>
        <h3>Get Early Warnings</h3>
      </div>

      <p className="subscribe-subtext">
        Subscribe to get alerts. Stay informed about landslide risk in your
        area.
      </p>

      <form className="subscribe-form" onSubmit={handleSubmit}>
        <div className="subscribe-row">
          <input
            type="email"
            placeholder="Enter email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <button type="submit">Submit</button>
        </div>

        <button
          type="button"
          className="subscribe-toggle"
          onClick={() => setShowExtra((prev) => !prev)}
        >
          {showExtra ? "Hide extra options" : "Add phone or pick a district"}
        </button>

        {showExtra && (
          <div className="subscribe-extra">
            <input
              type="tel"
              placeholder="Phone (optional)"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            <select
              value={districtId ?? ""}
              onChange={(e) =>
                setDistrictId(e.target.value ? Number(e.target.value) : null)
              }
            >
              {DISTRICTS.map((d) => (
                <option key={d.name} value={d.id ?? ""}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </form>
    </div>
  );
}

export default SubscribeAlert;
