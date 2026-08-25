export interface UserProfileData {
  username: string;
  coins: number;
  xp: number;
  level: number;
  unlockedVehicles: string[];
  completedStages: string[];
  bestTimes: Record<string, number>;
  graphicsQuality: "high" | "low";
  steeringSensitivity: number;
}

const SAVE_KEY = "racing_game_save";

export class SaveSystem {
  public static loadProfile(): UserProfileData {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) {
      const defaultProfile: UserProfileData = {
        username: "Guest Racer",
        coins: 100, // starting coins
        xp: 0,
        level: 1,
        unlockedVehicles: ["starter_car", "starter_bike"],
        completedStages: [],
        bestTimes: {},
        graphicsQuality: "high",
        steeringSensitivity: 1.0,
      };
      this.saveProfile(defaultProfile);
      return defaultProfile;
    }
    
    try {
      const profile = JSON.parse(raw);
      if (!profile.unlockedVehicles) profile.unlockedVehicles = ["starter_car", "starter_bike"];
      if (!profile.completedStages) profile.completedStages = [];
      if (!profile.bestTimes) profile.bestTimes = {};
      if (!profile.graphicsQuality) profile.graphicsQuality = "high";
      if (profile.steeringSensitivity === undefined) profile.steeringSensitivity = 1.0;
      return profile;
    } catch {
      localStorage.removeItem(SAVE_KEY);
      return this.loadProfile();
    }
  }

  public static saveProfile(profile: UserProfileData): void {
    this.saveProfileLocal(profile);

    // Sync save to server database in background
    fetch("http://localhost:3001/api/profile/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(profile),
    })
      .then((res) => {
        if (!res.ok) throw new Error("Server save error");
        return res.json();
      })
      .then(() => console.log("Save successfully persistent in backend database."))
      .catch((err) => console.warn("Failed to sync save with backend database (offline):", err.message));
  }

  private static saveProfileLocal(profile: UserProfileData): void {
    localStorage.setItem(SAVE_KEY, JSON.stringify(profile));
  }

  public static async syncWithDatabase(username: string): Promise<UserProfileData> {
    try {
      const res = await fetch("http://localhost:3001/api/profile/load", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      });

      if (!res.ok) throw new Error("HTTP load status fail");
      const profile = await res.json();

      // Maintain graphics and steering sensitivity local settings
      const local = this.loadProfile();
      profile.graphicsQuality = local.graphicsQuality || "high";
      profile.steeringSensitivity = local.steeringSensitivity !== undefined ? local.steeringSensitivity : 1.0;

      this.saveProfileLocal(profile);
      console.log(`Successfully synced profile '${username}' from database.`);
      return profile;
    } catch (error: any) {
      console.warn("Could not load profile from database. Fallback to localStorage.", error.message);
      return this.loadProfile();
    }
  }

  public static addRewards(
    coinsEarned: number,
    xpEarned: number
  ): { levelUp: boolean; xpNeeded: number; nextLevel: number } {
    const profile = this.loadProfile();
    profile.coins += coinsEarned;
    profile.xp += xpEarned;

    const xpPerLevel = 500;
    let nextLevel = profile.level;
    let levelUp = false;

    while (profile.xp >= nextLevel * xpPerLevel) {
      profile.xp -= nextLevel * xpPerLevel;
      nextLevel++;
      levelUp = true;
    }

    profile.level = nextLevel;
    this.saveProfile(profile);

    return {
      levelUp,
      xpNeeded: nextLevel * xpPerLevel,
      nextLevel,
    };
  }

  public static unlockStage(stageId: string): void {
    const profile = this.loadProfile();
    if (!profile.completedStages.includes(stageId)) {
      profile.completedStages.push(stageId);
      this.saveProfile(profile);
    }
  }
}
