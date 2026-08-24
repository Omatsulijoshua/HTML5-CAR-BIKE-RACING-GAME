export interface UserProfileData {
  username: string;
  coins: number;
  xp: number;
  level: number;
  unlockedVehicles: string[];
  completedStages: string[];
  bestTimes: Record<string, number>;
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
      };
      this.saveProfile(defaultProfile);
      return defaultProfile;
    }
    
    try {
      const profile = JSON.parse(raw);
      if (!profile.unlockedVehicles) profile.unlockedVehicles = ["starter_car", "starter_bike"];
      if (!profile.completedStages) profile.completedStages = [];
      if (!profile.bestTimes) profile.bestTimes = {};
      return profile;
    } catch {
      localStorage.removeItem(SAVE_KEY);
      return this.loadProfile();
    }
  }

  public static saveProfile(profile: UserProfileData): void {
    localStorage.setItem(SAVE_KEY, JSON.stringify(profile));
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
