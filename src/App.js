import React, { useState, useEffect } from "react";
import * as XLSX from "xlsx";
import "./App.css";

function App() {
  const [medicines, setMedicines] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [notification, setNotification] = useState(null);
  const [currentDate, setCurrentDate] = useState(getTodayDate());

  function getTodayDate() {
    const today = new Date();
    return today.toISOString().split("T")[0];
  }

  function formatDateDisplay(dateStr) {
    const date = new Date(dateStr);
    const options = {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    };
    return date.toLocaleDateString("en-US", options);
  }

  function getYesterdayDate() {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return yesterday.toISOString().split("T")[0];
  }

  useEffect(() => {
    loadTodayData();
    checkForDayChange();
    const interval = startAutoDayEndCheck();
    return () => clearInterval(interval);
  }, []);

  function loadTodayData() {
    const todayKey = `medicines-${currentDate}`;
    const saved = localStorage.getItem(todayKey);

    if (saved) {
      setMedicines(JSON.parse(saved));
      showNotification("Loaded today's inventory", "success");
    } else {
      const yesterday = getYesterdayDate();
      const yesterdayKey = `medicines-${yesterday}`;
      const yesterdayData = localStorage.getItem(yesterdayKey);

      if (yesterdayData) {
        const yesterdayMedicines = JSON.parse(yesterdayData);
        const rolledOver = yesterdayMedicines.map((med) => ({
          id: med.id,
          name: med.name,
          totalQuantity: calculateRemaining(med),
          addedQuantity: 0,
          usedQuantity: 0,
        }));
        setMedicines(rolledOver);
        localStorage.setItem(todayKey, JSON.stringify(rolledOver));
        showNotification("Rolled over from yesterday's data", "info");
      } else {
        setMedicines([]);
      }
    }
  }

  function checkForDayChange() {
    const lastCheckDate = localStorage.getItem("lastCheckDate");
    const today = getTodayDate();

    if (lastCheckDate && lastCheckDate !== today) {
      performDayEnd(lastCheckDate, false);
    }

    localStorage.setItem("lastCheckDate", today);
  }

  function startAutoDayEndCheck() {
    return setInterval(() => {
      const now = new Date();
      const hours = now.getHours();
      const minutes = now.getMinutes();

      // Changed to 12:01 AM (00:01)
      if (hours === 0 && minutes === 1) {
        const lastAutoBackup = localStorage.getItem("lastAutoBackup");
        const today = getTodayDate();

        if (lastAutoBackup !== today) {
          const yesterday = getYesterdayDate();
          performDayEnd(yesterday, true);
          localStorage.setItem("lastAutoBackup", today);
        }
      }
    }, 60000); // Check every minute for precise timing
  }

  function performDayEnd(dateToExport, autoExport) {
    const dataKey = `medicines-${dateToExport}`;
    const dataToExport = localStorage.getItem(dataKey);

    if (dataToExport && autoExport) {
      const medicinesData = JSON.parse(dataToExport);
      exportToExcel(medicinesData, dateToExport);
    }

    if (medicines.length > 0) {
      const tomorrow = new Date(dateToExport);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowDate = tomorrow.toISOString().split("T")[0];

      const rolledOverMedicines = medicines.map((med) => ({
        id: med.id,
        name: med.name,
        totalQuantity: calculateRemaining(med),
        addedQuantity: 0,
        usedQuantity: 0,
      }));

      const tomorrowKey = `medicines-${tomorrowDate}`;
      localStorage.setItem(tomorrowKey, JSON.stringify(rolledOverMedicines));

      // Only show notification and reload if it's automatic midnight rollover
      if (autoExport && tomorrowDate === getTodayDate()) {
        showNotification(
          `Day-end complete! Data rolled over to ${formatDateDisplay(
            tomorrowDate
          )}`,
          "success"
        );
        setTimeout(() => window.location.reload(), 2000);
      }
    }
  }

  function manualDayEnd() {
    if (
      window.confirm(
        "This will:\n1. Export today's data to Excel\n2. Roll over remaining quantities to tomorrow\n3. Reset added/used quantities\n\nContinue?"
      )
    ) {
      performDayEnd(currentDate, true);

      // Immediately update the current view with rolled over data
      const rolledOverMedicines = medicines.map((med) => ({
        id: med.id,
        name: med.name,
        totalQuantity: calculateRemaining(med),
        addedQuantity: 0,
        usedQuantity: 0,
      }));

      setMedicines(rolledOverMedicines);

      // Update the date to tomorrow
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowDate = tomorrow.toISOString().split("T")[0];
      setCurrentDate(tomorrowDate);

      // Save the rolled over data for tomorrow
      const tomorrowKey = `medicines-${tomorrowDate}`;
      localStorage.setItem(tomorrowKey, JSON.stringify(rolledOverMedicines));

      showNotification(
        "Day-end complete! Data rolled over to tomorrow. Page showing tomorrow's data now.",
        "success"
      );
    }
  }

  function addMedicine() {
    const newMedicine = {
      id: Date.now(),
      name: "",
      totalQuantity: 0,
      addedQuantity: 0,
      usedQuantity: 0,
    };
    setMedicines([...medicines, newMedicine]);
  }

  function deleteMedicine(id) {
    if (window.confirm("Are you sure you want to delete this medicine?")) {
      const updated = medicines.filter((med) => med.id !== id);
      setMedicines(updated);
      saveData(updated);
    }
  }

  function updateMedicine(id, field, value) {
    const updated = medicines.map((med) => {
      if (med.id === id) {
        return {
          ...med,
          [field]: field === "name" ? value : Number(value) || 0,
          lastUpdated: Date.now(), // Add timestamp for sorting
        };
      }
      return med;
    });
    setMedicines(updated);
  }

  function calculateRemaining(med) {
    const total = Number(med.totalQuantity) || 0;
    const added = Number(med.addedQuantity) || 0;
    const used = Number(med.usedQuantity) || 0;
    return total + added - used;
  }

  function saveData(data = medicines) {
    const todayKey = `medicines-${currentDate}`;
    localStorage.setItem(todayKey, JSON.stringify(data));
    showNotification("Data saved successfully!", "success");
  }

  function exportTodayExcel() {
    if (medicines.length === 0) {
      showNotification("No data to export!", "error");
      return;
    }
    exportToExcel(medicines, currentDate);
  }

  function importFromExcel(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: "array" });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(firstSheet);

        // Convert Excel data to medicine format
        const importedMedicines = jsonData.map((row, index) => ({
          id: Date.now() + index,
          name: row["Medicine Name"] || "",
          totalQuantity: Number(row["Opening Stock"]) || 0,
          addedQuantity: Number(row["Added Quantity"]) || 0,
          usedQuantity: Number(row["Used Quantity"]) || 0,
          lastUpdated: Date.now() + index,
        }));

        if (importedMedicines.length === 0) {
          showNotification("No valid data found in Excel file!", "error");
          return;
        }

        // Ask user if they want to replace or merge
        const shouldReplace = window.confirm(
          `Found ${importedMedicines.length} medicines in Excel file.\n\n` +
            `Current inventory has ${medicines.length} medicines.\n\n` +
            `Click OK to REPLACE current data\n` +
            `Click Cancel to MERGE with current data`
        );

        let finalMedicines;
        if (shouldReplace) {
          finalMedicines = importedMedicines;
        } else {
          // Merge: keep existing + add new
          finalMedicines = [...medicines, ...importedMedicines];
        }

        setMedicines(finalMedicines);
        saveData(finalMedicines);
        showNotification(
          `Successfully imported ${importedMedicines.length} medicines!`,
          "success"
        );
      } catch (error) {
        console.error("Import error:", error);
        showNotification(
          "Failed to import Excel file. Please check the format.",
          "error"
        );
      }
    };

    reader.readAsArrayBuffer(file);
    event.target.value = ""; // Reset input
  }

  function exportToExcel(data, date) {
    const excelData = data.map((med) => ({
      "Medicine Name": med.name,
      "Opening Stock": med.totalQuantity,
      "Added Quantity": med.addedQuantity,
      "Used Quantity": med.usedQuantity,
      "Closing Stock": calculateRemaining(med),
      Status:
        calculateRemaining(med) <= 0
          ? "Out of Stock"
          : calculateRemaining(med) < 10
          ? "Low Stock"
          : "In Stock",
    }));

    const ws = XLSX.utils.json_to_sheet(excelData);
    ws["!cols"] = [
      { wch: 30 },
      { wch: 15 },
      { wch: 15 },
      { wch: 15 },
      { wch: 15 },
      { wch: 15 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Daily Inventory");
    const filename = `Medicine_Inventory_${date}.xlsx`;
    XLSX.writeFile(wb, filename);

    showNotification(`Excel exported: ${filename}`, "success");
  }

  function viewHistory() {
    let historyDates = [];

    for (let i = 0; i < 30; i++) {
      const checkDate = new Date();
      checkDate.setDate(checkDate.getDate() - i);
      const dateStr = checkDate.toISOString().split("T")[0];
      const key = `medicines-${dateStr}`;

      if (localStorage.getItem(key)) {
        historyDates.push(formatDateDisplay(dateStr));
      }
    }

    if (historyDates.length === 0) {
      alert("No historical records found.");
    } else {
      alert("Available Daily Records:\n\n" + historyDates.join("\n"));
    }
  }

  function showNotification(message, type) {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4000);
  }

  const filteredMedicines = medicines
    .filter((med) => med.name.toLowerCase().includes(searchTerm.toLowerCase()))
    .sort((a, b) => {
      // Sort by lastUpdated timestamp, newest first
      const timeA = a.lastUpdated || a.id;
      const timeB = b.lastUpdated || b.id;
      return timeB - timeA;
    });

  const getLowStockCount = () => {
    return medicines.filter((med) => {
      const remaining = calculateRemaining(med);
      return remaining < 10 && remaining > 0;
    }).length;
  };

  const getOutOfStockCount = () => {
    return medicines.filter((med) => calculateRemaining(med) <= 0).length;
  };

  return (
    <div className="app">
      <div className="container">
        <div className="header-card">
          <div className="header-top">
            <div className="title-section">
              <h1>Medicine Inventory Manager</h1>
              <p className="subtitle">
                Hospital Medical Store - Daily Management System
              </p>
            </div>
            <div className="button-group">
              <button className="btn-info" onClick={viewHistory}>
                <span>📅</span> View History
              </button>
            </div>
          </div>
        </div>

        {notification && (
          <div className={`notification ${notification.type}`}>
            <span>
              {notification.type === "success"
                ? "✅"
                : notification.type === "info"
                ? "ℹ️"
                : "❌"}
            </span>
            {notification.message}
          </div>
        )}

        <div className="table-header">
          <h2>Medicine Inventory</h2>
          <div className="table-header-buttons">
            <label htmlFor="excel-import" className="file-import-label">
              <span>📥</span> Import from Excel
            </label>
            <input
              id="excel-import"
              type="file"
              accept=".xlsx,.xls"
              onChange={importFromExcel}
              style={{ display: "none" }}
            />
            <button className="btn-primary" onClick={addMedicine}>
              <span>➕</span> Add Medicine
            </button>
            <button className="btn-success" onClick={() => saveData()}>
              <span>💾</span> Save Today
            </button>
          </div>
        </div>

        <div className="table-card scrollable-table">
          <table>
            <thead>
              <tr>
                <th className="sno-header">S.No</th>
                <th>Medicine Name</th>
                <th>Total Quantity (Opening)</th>
                <th>Added Quantity</th>
                <th>Used Quantity</th>
                <th>Remaining (Closing)</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredMedicines.length === 0 ? (
                <tr>
                  <td colSpan="7" className="empty-state">
                    {medicines.length === 0
                      ? 'No medicines found. Click "Add Medicine" to get started.'
                      : "No medicines match your search."}
                  </td>
                </tr>
              ) : (
                filteredMedicines.map((med, index) => {
                  const remaining = calculateRemaining(med);
                  const badgeClass =
                    remaining <= 0
                      ? "red"
                      : remaining < 10
                      ? "yellow"
                      : "green";

                  return (
                    <tr key={med.id}>
                      <td className="serial-number">{index + 1}</td>
                      <td>
                        <input
                          type="text"
                          value={med.name}
                          placeholder="Enter medicine name"
                          onChange={(e) =>
                            updateMedicine(med.id, "name", e.target.value)
                          }
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          value={med.totalQuantity}
                          min="0"
                          onFocus={(e) => e.target.select()}
                          onChange={(e) =>
                            updateMedicine(
                              med.id,
                              "totalQuantity",
                              e.target.value
                            )
                          }
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          value={med.addedQuantity}
                          min="0"
                          onFocus={(e) => e.target.select()}
                          onChange={(e) =>
                            updateMedicine(
                              med.id,
                              "addedQuantity",
                              e.target.value
                            )
                          }
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          value={med.usedQuantity}
                          min="0"
                          onFocus={(e) => e.target.select()}
                          onChange={(e) =>
                            updateMedicine(
                              med.id,
                              "usedQuantity",
                              e.target.value
                            )
                          }
                        />
                      </td>
                      <td>
                        <div className={`remaining-badge ${badgeClass}`}>
                          {remaining}
                        </div>
                      </td>
                      <td>
                        <button
                          className="btn-danger"
                          onClick={() => deleteMedicine(med.id)}
                        >
                          🗑️
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="header-card dashboard-section">
          <div className="date-display">
            📅 {formatDateDisplay(currentDate)}
          </div>

          <div className="stats-grid">
            <div className="stat-card blue">
              <div className="stat-label">Total Medicines</div>
              <div className="stat-value">{medicines.length}</div>
            </div>
            <div className="stat-card yellow">
              <div className="stat-label">Low Stock</div>
              <div className="stat-value">{getLowStockCount()}</div>
            </div>
            <div className="stat-card red">
              <div className="stat-label">Out of Stock</div>
              <div className="stat-value">{getOutOfStockCount()}</div>
            </div>
            <div className="action-buttons">
              <button className="btn-secondary" onClick={exportTodayExcel}>
                <span>📊</span> Export Today (Excel)
              </button>
              <button className="btn-info" onClick={manualDayEnd}>
                <span>🔄</span> End Day & Rollover
              </button>
            </div>
          </div>

          <div className="auto-backup-info">
            <strong>🤖 Auto Day-End:</strong> System checks every minute. At{" "}
            <strong>12:01 AM</strong>, it will automatically:
            <br />• Export today's data to Excel
            <br />• Roll over remaining quantities to tomorrow's total
            <br />• Reset added and used quantities to 0
            <br />• You can also manually trigger "End Day & Rollover" anytime
          </div>

          <div className="search-box">
            {/* <span className="search-icon"></span> */}
            <input
              type="text"
              placeholder="Search medicines..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <div className="footer-info">
          <div className="footer-info-content">
            <span className="icon">ℹ️</span>
            <div>
              <strong>Daily Workflow:</strong>
              <br />• Start day: Yesterday's remaining → Today's total quantity
              <br />• Add new stock in "Added Quantity"
              <br />• Track usage in "Used Quantity"
              <br />• Remaining = Total + Added - Used
              <br />• End day: Auto exports to Excel & rolls over to next day
              <br />
              <strong>Color Codes:</strong> Red (Out of Stock), Yellow (Low
              Stock &lt; 10), Green (In Stock)
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
